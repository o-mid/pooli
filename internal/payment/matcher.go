package payment

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pooli-shop/pooli/internal/domain"
)

type MatchResult struct {
	PaymentIntentID string `json:"payment_intent_id"`
	PaymentOptionID string `json:"payment_option_id"`
	MatchType       string `json:"match_type"`
	NewStatus       string `json:"new_status"`
	Duplicate       bool   `json:"duplicate"`
	Ignored         bool   `json:"ignored"`
}

type Matcher struct {
	Pool              *pgxpool.Pool
	BSCConfirmations  int
	TronConfirmations int
	// LateReconcileWindow bounds exact matches against released reservations
	// after quote/reservation expiry. Zero defaults to 2 hours.
	LateReconcileWindow time.Duration
	OnTransition        func(merchantID, intentID, eventType string, payload map[string]any)
}

func (m *Matcher) lateWindow() time.Duration {
	if m.LateReconcileWindow <= 0 {
		return 2 * time.Hour
	}
	return m.LateReconcileWindow
}

// eventTime prefers on-chain block_timestamp from Raw when present; otherwise ObservedAt.
func eventTime(ev domain.ChainEvent) time.Time {
	if ev.Raw != nil {
		switch v := ev.Raw["block_timestamp"].(type) {
		case int64:
			if v > 1_000_000_000_000 {
				return time.UnixMilli(v).UTC()
			}
			if v > 0 {
				return time.Unix(v, 0).UTC()
			}
		case float64:
			iv := int64(v)
			if iv > 1_000_000_000_000 {
				return time.UnixMilli(iv).UTC()
			}
			if iv > 0 {
				return time.Unix(iv, 0).UTC()
			}
		case json.Number:
			if iv, err := v.Int64(); err == nil {
				if iv > 1_000_000_000_000 {
					return time.UnixMilli(iv).UTC()
				}
				if iv > 0 {
					return time.Unix(iv, 0).UTC()
				}
			}
		}
	}
	if !ev.ObservedAt.IsZero() {
		return ev.ObservedAt.UTC()
	}
	return time.Now().UTC()
}

func (m *Matcher) Ingest(ctx context.Context, ev domain.ChainEvent) (MatchResult, error) {
	if ev.EventID == "" || ev.Network == "" || ev.TokenContract == "" || ev.To == "" {
		return MatchResult{}, fmt.Errorf("invalid chain event")
	}
	toNorm := normalizeAddress(ev.Network, ev.To)
	tokenNorm := normalizeAddress(ev.Network, ev.TokenContract)

	var result MatchResult
	err := WithTx(ctx, m.Pool, func(tx pgx.Tx) error {
		raw, _ := json.Marshal(ev.Raw)
		if raw == nil {
			raw = []byte("{}")
		}
		var chainEventID string
		err := tx.QueryRow(ctx, `
			INSERT INTO chain_events (
				event_id, network, chain_id, tx_hash, log_index, token_contract,
				from_address, to_address, to_address_normalized, amount_base_units,
				block_number, confirmations, observed_at, raw_json
			) VALUES (
				$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb
			)
			ON CONFLICT (event_id) DO NOTHING
			RETURNING id::text`,
			ev.EventID, ev.Network, ev.ChainID, ev.TxHash, ev.LogIndex, tokenNorm,
			ev.From, ev.To, toNorm, ev.AmountBaseUnits, ev.BlockNumber, ev.Confirmations, ev.ObservedAt, string(raw),
		).Scan(&chainEventID)
		if err == pgx.ErrNoRows {
			result.Ignored = true
			result.Duplicate = true
			return nil
		}
		if err != nil {
			return err
		}

		var optionID, intentID, intentStatus, reservationStatus string
		var expiresAt time.Time
		var merchantID string
		err = tx.QueryRow(ctx, `
			SELECT po.id::text, pi.id::text, pi.status, pi.expires_at, pi.merchant_id::text, ar.status
			FROM amount_reservations ar
			JOIN payment_options po ON po.id = ar.payment_option_id
			JOIN payment_intents pi ON pi.id = po.payment_intent_id
			WHERE ar.status IN ('active', 'matched')
			  AND ar.destination_address_normalized = $1
			  AND ar.network = $2
			  AND ar.token_contract = $3
			  AND ar.pay_amount_base_units = $4
			ORDER BY CASE ar.status WHEN 'active' THEN 0 ELSE 1 END
			LIMIT 1`,
			toNorm, ev.Network, tokenNorm, ev.AmountBaseUnits,
		).Scan(&optionID, &intentID, &intentStatus, &expiresAt, &merchantID, &reservationStatus)
		if err == pgx.ErrNoRows {
			handled, herr := m.reconcileReleasedExact(ctx, tx, chainEventID, toNorm, tokenNorm, ev, &result)
			if herr != nil {
				return herr
			}
			if handled {
				return nil
			}
			// Try near-miss detection for review
			return m.handleUnmatched(ctx, tx, chainEventID, toNorm, ev, &result)
		}
		if err != nil {
			return err
		}

		result.PaymentIntentID = intentID
		result.PaymentOptionID = optionID

		// Already locked or paid: second exact transfer cannot rematch the same option.
		if reservationStatus == "matched" || intentStatus == domain.StatusPaid ||
			intentStatus == domain.StatusSeen || intentStatus == domain.StatusConfirming {
			result.MatchType = "DUPLICATE_PAYMENT"
			next := domain.StatusDuplicatePayment
			if intentStatus == domain.StatusSeen || intentStatus == domain.StatusConfirming {
				// Keep first match in flight; escalate for operator review.
				next = domain.StatusNeedsReview
			}
			result.NewStatus = next
			if intentStatus != next {
				if err := m.appendState(ctx, tx, intentID, intentStatus, next, "second exact transfer while matched/paid", "system", ev); err != nil {
					return err
				}
				_, _ = tx.Exec(ctx, `UPDATE payment_intents SET status=$2, updated_at=now() WHERE id=$1::uuid`,
					intentID, next)
			}
			_, err = tx.Exec(ctx, `
				INSERT INTO matched_transactions (chain_event_id, payment_intent_id, payment_option_id, match_type)
				VALUES ($1::uuid, $2::uuid, $3::uuid, $4)
				ON CONFLICT (chain_event_id) DO NOTHING`, chainEventID, intentID, optionID, result.MatchType)
			m.emit(merchantID, intentID, "payment.needs_review", map[string]any{"status": result.NewStatus, "tx_hash": ev.TxHash})
			return err
		}

		if eventTime(ev).After(expiresAt) && intentStatus != domain.StatusPaid {
			result.MatchType = "LATE_PAYMENT"
			result.NewStatus = domain.StatusLatePayment
			if err := m.transition(ctx, tx, intentID, intentStatus, domain.StatusLatePayment, "payment after expiry", optionID, chainEventID, result.MatchType); err != nil {
				return err
			}
			_, _ = tx.Exec(ctx, `UPDATE chain_events SET processed_at=now() WHERE id=$1::uuid`, chainEventID)
			m.emit(merchantID, intentID, "payment.needs_review", map[string]any{"status": result.NewStatus, "tx_hash": ev.TxHash})
			return nil
		}

		needed := m.requiredConfirmations(ev.Network)
		next := domain.StatusSeen
		eventType := "payment.seen"
		if ev.Confirmations >= needed {
			next = domain.StatusPaid
			eventType = "payment.paid"
		} else if ev.Confirmations > 0 {
			next = domain.StatusConfirming
			eventType = "payment.confirming"
		}

		result.MatchType = "EXACT"
		result.NewStatus = next
		if err := m.transition(ctx, tx, intentID, intentStatus, next, "exact amount match", optionID, chainEventID, result.MatchType); err != nil {
			return err
		}
		// Lock payable amount immediately (matched != settled).
		_, err = tx.Exec(ctx, `
			UPDATE amount_reservations SET status='matched'
			WHERE payment_option_id=$1::uuid AND status='active'`, optionID)
		if err != nil {
			return err
		}
		if next == domain.StatusPaid {
			if err := m.settlePaid(ctx, tx, merchantID, intentID, optionID); err != nil {
				return err
			}
		}
		_, err = tx.Exec(ctx, `UPDATE chain_events SET processed_at=now() WHERE id=$1::uuid`, chainEventID)
		if err != nil {
			return err
		}
		m.emit(merchantID, intentID, eventType, map[string]any{
			"status": next, "tx_hash": ev.TxHash, "network": ev.Network,
			"amount_base_units": ev.AmountBaseUnits,
			"confirmations":     ev.Confirmations,
			"required_confirmations": needed,
		})
		return nil
	})
	return result, err
}

// reconcileReleasedExact associates an exact transfer with a recently released reservation.
// Returns handled=true when the event was resolved as LATE_PAYMENT or left unmatched due to ambiguity.
// Returns handled=false when zero candidates — caller should fall through to near-miss handling.
func (m *Matcher) reconcileReleasedExact(
	ctx context.Context, tx pgx.Tx, chainEventID, toNorm, tokenNorm string,
	ev domain.ChainEvent, result *MatchResult,
) (bool, error) {
	evAt := eventTime(ev)
	windowSecs := int64(m.lateWindow() / time.Second)
	rows, err := tx.Query(ctx, `
		SELECT po.id::text, pi.id::text, pi.status, pi.merchant_id::text, ar.expires_at
		FROM amount_reservations ar
		JOIN payment_options po ON po.id = ar.payment_option_id
		JOIN payment_intents pi ON pi.id = po.payment_intent_id
		WHERE ar.status = 'released'
		  AND ar.destination_address_normalized = $1
		  AND ar.network = $2
		  AND ar.token_contract = $3
		  AND ar.pay_amount_base_units = $4
		  AND pi.status <> $5
		  AND ar.expires_at <= $6::timestamptz
		  AND $6::timestamptz <= ar.expires_at + make_interval(secs => $7::int)
		ORDER BY ar.expires_at DESC, ar.created_at DESC
		LIMIT 5`,
		toNorm, ev.Network, tokenNorm, ev.AmountBaseUnits, domain.StatusPaid,
		evAt, windowSecs,
	)
	if err != nil {
		return false, err
	}
	defer rows.Close()

	type cand struct {
		optionID, intentID, status, merchantID string
		expiresAt                              time.Time
	}
	var cands []cand
	for rows.Next() {
		var c cand
		if err := rows.Scan(&c.optionID, &c.intentID, &c.status, &c.merchantID, &c.expiresAt); err != nil {
			return false, err
		}
		cands = append(cands, c)
	}
	if err := rows.Err(); err != nil {
		return false, err
	}
	if len(cands) == 0 {
		return false, nil
	}
	if len(cands) > 1 {
		// Ambiguous historical exact matches — never guess; leave unmatched for operator review.
		result.MatchType = "AMBIGUOUS_LATE"
		result.Ignored = true
		_, _ = tx.Exec(ctx, `
			UPDATE chain_events
			SET processed_at = now(),
			    raw_json = COALESCE(raw_json, '{}'::jsonb) || jsonb_build_object(
			      'late_reconcile', 'ambiguous_released_candidates',
			      'candidate_count', $2::int
			    )
			WHERE id = $1::uuid`, chainEventID, len(cands))
		m.emit(cands[0].merchantID, "", "payment.unmatched_ambiguous", map[string]any{
			"reason":           "ambiguous_released_exact",
			"tx_hash":          ev.TxHash,
			"candidate_count":  len(cands),
			"amount_base_units": ev.AmountBaseUnits,
			"network":          ev.Network,
		})
		return true, nil
	}

	c := cands[0]
	result.PaymentIntentID = c.intentID
	result.PaymentOptionID = c.optionID
	result.MatchType = "LATE_PAYMENT"
	result.NewStatus = domain.StatusLatePayment
	if err := m.transition(ctx, tx, c.intentID, c.status, domain.StatusLatePayment, "exact payment after reservation release", c.optionID, chainEventID, result.MatchType); err != nil {
		return true, err
	}
	_, _ = tx.Exec(ctx, `UPDATE chain_events SET processed_at=now() WHERE id=$1::uuid`, chainEventID)
	m.emit(c.merchantID, c.intentID, "payment.needs_review", map[string]any{
		"status": result.NewStatus, "tx_hash": ev.TxHash, "match_type": result.MatchType,
	})
	return true, nil
}

func (m *Matcher) handleUnmatched(ctx context.Context, tx pgx.Tx, chainEventID, toNorm string, ev domain.ChainEvent, result *MatchResult) error {
	// Look for active options to same destination/token with nearby amounts (±1000 base units)
	rows, err := tx.Query(ctx, `
		SELECT po.id::text, pi.id::text, pi.status, ar.pay_amount_base_units, pi.merchant_id::text
		FROM amount_reservations ar
		JOIN payment_options po ON po.id = ar.payment_option_id
		JOIN payment_intents pi ON pi.id = po.payment_intent_id
		WHERE ar.status = 'active'
		  AND ar.destination_address_normalized = $1
		  AND ar.network = $2
		  AND ar.token_contract = $3
		  AND ar.pay_amount_base_units BETWEEN $4 AND $5
		  AND pi.status IN ('AWAITING_PAYMENT','SEEN','CONFIRMING','CREATED')
		ORDER BY ABS(ar.pay_amount_base_units - $6)
		LIMIT 5`,
		toNorm, ev.Network, normalizeAddress(ev.Network, ev.TokenContract),
		ev.AmountBaseUnits-1000, ev.AmountBaseUnits+1000, ev.AmountBaseUnits,
	)
	if err != nil {
		return err
	}
	defer rows.Close()
	type cand struct {
		optionID, intentID, status, merchantID string
		amount                                 int64
	}
	var cands []cand
	for rows.Next() {
		var c cand
		if err := rows.Scan(&c.optionID, &c.intentID, &c.status, &c.amount, &c.merchantID); err != nil {
			return err
		}
		cands = append(cands, c)
	}
	if len(cands) == 0 {
		result.Ignored = true
		_, _ = tx.Exec(ctx, `UPDATE chain_events SET processed_at=now() WHERE id=$1::uuid`, chainEventID)
		return nil
	}
	if len(cands) > 1 {
		// Ambiguous — do not auto settle
		c := cands[0]
		result.PaymentIntentID = c.intentID
		result.PaymentOptionID = c.optionID
		result.MatchType = "AMBIGUOUS"
		result.NewStatus = domain.StatusNeedsReview
		if err := m.transition(ctx, tx, c.intentID, c.status, domain.StatusNeedsReview, "ambiguous nearby amounts", c.optionID, chainEventID, result.MatchType); err != nil {
			return err
		}
		m.emit(c.merchantID, c.intentID, "payment.needs_review", map[string]any{"reason": "ambiguous"})
		return nil
	}
	c := cands[0]
	result.PaymentIntentID = c.intentID
	result.PaymentOptionID = c.optionID
	diff := ev.AmountBaseUnits - c.amount
	switch {
	case diff < 0:
		result.MatchType = "UNDERPAID"
		result.NewStatus = domain.StatusUnderpaid
	case diff > 0:
		result.MatchType = "OVERPAID"
		result.NewStatus = domain.StatusOverpaid
	default:
		result.MatchType = "ROUNDED"
		result.NewStatus = domain.StatusNeedsReview
	}
	if err := m.transition(ctx, tx, c.intentID, c.status, result.NewStatus, result.MatchType, c.optionID, chainEventID, result.MatchType); err != nil {
		return err
	}
	m.emit(c.merchantID, c.intentID, "payment.needs_review", map[string]any{"match_type": result.MatchType})
	return nil
}

func (m *Matcher) transition(ctx context.Context, tx pgx.Tx, intentID, from, to, reason, optionID, chainEventID, matchType string) error {
	if err := m.appendState(ctx, tx, intentID, from, to, reason, "system", nil); err != nil {
		return err
	}
	paidAt := interface{}(nil)
	if to == domain.StatusPaid {
		paidAt = time.Now().UTC()
	}
	_, err := tx.Exec(ctx, `
		UPDATE payment_intents SET status=$2, paid_at=COALESCE($3::timestamptz, paid_at), updated_at=now()
		WHERE id=$1::uuid`, intentID, to, paidAt)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO matched_transactions (chain_event_id, payment_intent_id, payment_option_id, match_type)
		VALUES ($1::uuid, $2::uuid, $3::uuid, $4)
		ON CONFLICT (chain_event_id) DO NOTHING`, chainEventID, intentID, optionID, matchType)
	return err
}

func (m *Matcher) appendState(ctx context.Context, tx pgx.Tx, intentID, from, to, reason, actor string, meta any) error {
	b, _ := json.Marshal(meta)
	if b == nil {
		b = []byte("{}")
	}
	_, err := tx.Exec(ctx, `
		INSERT INTO payment_state_events (payment_intent_id, from_status, to_status, reason, actor, metadata_json)
		VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb)`, intentID, from, to, reason, actor, string(b))
	return err
}

func (m *Matcher) requiredConfirmations(network string) int {
	if network == domain.NetworkBSC {
		if m.BSCConfirmations <= 0 {
			return 15
		}
		return m.BSCConfirmations
	}
	if m.TronConfirmations <= 0 {
		return 1
	}
	return m.TronConfirmations
}

func (m *Matcher) emit(merchantID, intentID, eventType string, payload map[string]any) {
	if m.OnTransition != nil {
		m.OnTransition(merchantID, intentID, eventType, payload)
	}
}


func (m *Matcher) settlePaid(ctx context.Context, tx pgx.Tx, merchantID, intentID, optionID string) error {
	if optionID != "" {
		if _, err := tx.Exec(ctx, `
			UPDATE amount_reservations SET status='consumed'
			WHERE payment_option_id=$1::uuid AND status IN ('active','matched')`, optionID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			UPDATE payment_options SET status='SETTLED' WHERE id=$1::uuid AND status <> 'SETTLED'`, optionID); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(ctx, `
		UPDATE orders SET status='PAID', updated_at=now()
		WHERE id=(SELECT order_id FROM payment_intents WHERE id=$1::uuid)`, intentID); err != nil {
		return err
	}
	period := time.Now().UTC().Format("2006-01")
	_, err := tx.Exec(ctx, `
		INSERT INTO usage_counters (merchant_id, period_ym, verified_payments)
		VALUES ($1::uuid, $2, 1)
		ON CONFLICT (merchant_id, period_ym)
		DO UPDATE SET verified_payments = usage_counters.verified_payments + 1`, merchantID, period)
	return err
}

func normalizeAddress(network, addr string) string {
	addr = strings.TrimSpace(addr)
	if network == domain.NetworkBSC || strings.HasPrefix(strings.ToLower(addr), "0x") {
		return strings.ToLower(addr)
	}
	return addr
}

// AdvanceConfirmations upgrades SEEN/CONFIRMING intents when confirmations suffice.
func (m *Matcher) ApplyConfirmations(ctx context.Context, eventID string, confirmations int) error {
	return WithTx(ctx, m.Pool, func(tx pgx.Tx) error {
		var intentID, status, merchantID, txHash, network string
		var amount int64
		err := tx.QueryRow(ctx, `
			SELECT pi.id::text, pi.status, pi.merchant_id::text, ce.tx_hash, ce.network, ce.amount_base_units
			FROM chain_events ce
			JOIN matched_transactions mt ON mt.chain_event_id = ce.id
			JOIN payment_intents pi ON pi.id = mt.payment_intent_id
			WHERE ce.event_id = $1 AND mt.match_type = 'EXACT'`, eventID).Scan(&intentID, &status, &merchantID, &txHash, &network, &amount)
		if err == pgx.ErrNoRows {
			return nil
		}
		if err != nil {
			return err
		}
		_, _ = tx.Exec(ctx, `UPDATE chain_events SET confirmations=$2 WHERE event_id=$1`, eventID, confirmations)
		needed := m.requiredConfirmations(network)
		if status == domain.StatusPaid {
			return nil
		}
		next := domain.StatusConfirming
		evt := "payment.confirming"
		if confirmations >= needed {
			next = domain.StatusPaid
			evt = "payment.paid"
		}
		if next == status {
			return nil
		}
		if err := m.appendState(ctx, tx, intentID, status, next, "confirmation update", "system", map[string]any{"confirmations": confirmations}); err != nil {
			return err
		}
		paidAt := interface{}(nil)
		var optionID string
		_ = tx.QueryRow(ctx, `
			SELECT mt.payment_option_id::text FROM matched_transactions mt
			JOIN chain_events ce ON ce.id = mt.chain_event_id
			WHERE ce.event_id=$1 AND mt.match_type='EXACT' LIMIT 1`, eventID).Scan(&optionID)
		if next == domain.StatusPaid {
			paidAt = time.Now().UTC()
			if err := m.settlePaid(ctx, tx, merchantID, intentID, optionID); err != nil {
				return err
			}
		}
		_, err = tx.Exec(ctx, `
			UPDATE payment_intents SET status=$2, paid_at=COALESCE($3::timestamptz, paid_at), updated_at=now()
			WHERE id=$1::uuid`, intentID, next, paidAt)
		if err != nil {
			return err
		}
		m.emit(merchantID, intentID, evt, map[string]any{"status": next, "tx_hash": txHash, "network": network, "confirmations": confirmations, "required_confirmations": needed})
		return nil
	})
}
