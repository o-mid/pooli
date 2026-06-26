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
	OnTransition      func(merchantID, intentID, eventType string, payload map[string]any)
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

		var optionID, intentID, intentStatus string
		var expiresAt time.Time
		var merchantID string
		err = tx.QueryRow(ctx, `
			SELECT po.id::text, pi.id::text, pi.status, pi.expires_at, pi.merchant_id::text
			FROM amount_reservations ar
			JOIN payment_options po ON po.id = ar.payment_option_id
			JOIN payment_intents pi ON pi.id = po.payment_intent_id
			WHERE ar.status = 'active'
			  AND ar.destination_address_normalized = $1
			  AND ar.network = $2
			  AND ar.token_contract = $3
			  AND ar.pay_amount_base_units = $4
			LIMIT 1`,
			toNorm, ev.Network, tokenNorm, ev.AmountBaseUnits,
		).Scan(&optionID, &intentID, &intentStatus, &expiresAt, &merchantID)
		if err == pgx.ErrNoRows {
			// Try near-miss detection for review
			return m.handleUnmatched(ctx, tx, chainEventID, toNorm, ev, &result)
		}
		if err != nil {
			return err
		}

		result.PaymentIntentID = intentID
		result.PaymentOptionID = optionID

		if intentStatus == domain.StatusPaid {
			result.MatchType = "DUPLICATE_PAYMENT"
			result.NewStatus = domain.StatusDuplicatePayment
			if err := m.appendState(ctx, tx, intentID, intentStatus, domain.StatusDuplicatePayment, "second payment after paid", "system", ev); err != nil {
				return err
			}
			_, _ = tx.Exec(ctx, `UPDATE payment_intents SET status=$2, updated_at=now() WHERE id=$1::uuid AND status=$3`,
				intentID, domain.StatusDuplicatePayment, intentStatus)
			_, err = tx.Exec(ctx, `
				INSERT INTO matched_transactions (chain_event_id, payment_intent_id, payment_option_id, match_type)
				VALUES ($1::uuid, $2::uuid, $3::uuid, $4)`, chainEventID, intentID, optionID, result.MatchType)
			return err
		}

		now := time.Now().UTC()
		if now.After(expiresAt) && intentStatus != domain.StatusPaid {
			result.MatchType = "LATE_PAYMENT"
			result.NewStatus = domain.StatusLatePayment
			if err := m.transition(ctx, tx, intentID, intentStatus, domain.StatusLatePayment, "payment after expiry", optionID, chainEventID, result.MatchType); err != nil {
				return err
			}
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
		if next == domain.StatusPaid {
			_, err = tx.Exec(ctx, `
				UPDATE amount_reservations SET status='consumed' WHERE payment_option_id=$1::uuid`, optionID)
			if err != nil {
				return err
			}
			_, err = tx.Exec(ctx, `
				UPDATE payment_options SET status='SETTLED' WHERE id=$1::uuid`, optionID)
			if err != nil {
				return err
			}
			_, err = tx.Exec(ctx, `
				UPDATE orders SET status='PAID', updated_at=now()
				WHERE id = (SELECT order_id FROM payment_intents WHERE id=$1::uuid)`, intentID)
			if err != nil {
				return err
			}
			period := time.Now().UTC().Format("2006-01")
			_, err = tx.Exec(ctx, `
				INSERT INTO usage_counters (merchant_id, period_ym, verified_payments)
				VALUES ($1::uuid, $2, 1)
				ON CONFLICT (merchant_id, period_ym)
				DO UPDATE SET verified_payments = usage_counters.verified_payments + 1`, merchantID, period)
			if err != nil {
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
			return 12
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
		if next == domain.StatusPaid {
			paidAt = time.Now().UTC()
			_, err = tx.Exec(ctx, `
				UPDATE orders SET status='PAID', updated_at=now()
				WHERE id=(SELECT order_id FROM payment_intents WHERE id=$1::uuid)`, intentID)
			if err != nil {
				return err
			}
			_, err = tx.Exec(ctx, `
				UPDATE amount_reservations SET status='consumed'
				WHERE payment_option_id=(SELECT payment_option_id FROM matched_transactions mt
					JOIN chain_events ce ON ce.id = mt.chain_event_id WHERE ce.event_id=$1 LIMIT 1)`, eventID)
			if err != nil {
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
