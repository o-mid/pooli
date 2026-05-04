package httpapi

import (
	"net/http"

	"github.com/jackc/pgx/v5"
	"github.com/pooli-shop/pooli/internal/domain"
	"github.com/pooli-shop/pooli/internal/payment"
)

func (s *Server) handleAdminListIntents(w http.ResponseWriter, r *http.Request) {
	rows, err := s.Pool.Query(r.Context(), `
		SELECT id::text, merchant_id::text, order_id::text, fiat_amount_toman, status, expires_at, paid_at, created_at
		FROM payment_intents ORDER BY created_at DESC LIMIT 200`)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var id, mid, oid, status string
		var toman int64
		var expires, created interface{}
		var paidAt interface{}
		_ = rows.Scan(&id, &mid, &oid, &toman, &status, &expires, &paidAt, &created)
		out = append(out, map[string]any{
			"id": id, "merchant_id": mid, "order_id": oid, "fiat_amount_toman": toman,
			"status": status, "expires_at": expires, "paid_at": paidAt, "created_at": created,
		})
	}
	if out == nil {
		out = []map[string]any{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"payment_intents": out})
}

func (s *Server) handleAdminChainEvents(w http.ResponseWriter, r *http.Request) {
	rows, err := s.Pool.Query(r.Context(), `
		SELECT event_id, network, tx_hash, token_contract, to_address, amount_base_units, confirmations, observed_at, processed_at
		FROM chain_events ORDER BY observed_at DESC LIMIT 200`)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var eventID, network, txHash, token, toAddr string
		var amount int64
		var conf int
		var observed, processed interface{}
		_ = rows.Scan(&eventID, &network, &txHash, &token, &toAddr, &amount, &conf, &observed, &processed)
		out = append(out, map[string]any{
			"event_id": eventID, "network": network, "tx_hash": txHash, "token_contract": token,
			"to": toAddr, "amount_base_units": amount, "confirmations": conf,
			"observed_at": observed, "processed_at": processed,
		})
	}
	if out == nil {
		out = []map[string]any{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"chain_events": out})
}

func (s *Server) handleAdminUnmatched(w http.ResponseWriter, r *http.Request) {
	rows, err := s.Pool.Query(r.Context(), `
		SELECT ce.event_id, ce.network, ce.tx_hash, ce.amount_base_units, ce.to_address, ce.observed_at
		FROM chain_events ce
		LEFT JOIN matched_transactions mt ON mt.chain_event_id = ce.id
		WHERE mt.id IS NULL
		ORDER BY ce.observed_at DESC LIMIT 100`)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var eventID, network, txHash, toAddr string
		var amount int64
		var observed interface{}
		_ = rows.Scan(&eventID, &network, &txHash, &amount, &toAddr, &observed)
		out = append(out, map[string]any{
			"event_id": eventID, "network": network, "tx_hash": txHash,
			"amount_base_units": amount, "to": toAddr, "observed_at": observed,
		})
	}
	if out == nil {
		out = []map[string]any{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"unmatched": out})
}

func (s *Server) handleAdminResolve(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	var req struct {
		PaymentIntentID string `json:"payment_intent_id"`
		Action          string `json:"action"` // mark_paid | needs_review
		Reason          string `json:"reason"`
		ChainEventID    string `json:"event_id"`
	}
	if err := decodeJSON(r, &req); err != nil || req.PaymentIntentID == "" || req.Reason == "" {
		writeErr(w, http.StatusBadRequest, "payment_intent_id and reason required")
		return
	}
	to := domain.StatusNeedsReview
	if req.Action == "mark_paid" {
		to = domain.StatusPaid
	}
	err := payment.WithTx(r.Context(), s.Pool, func(tx pgx.Tx) error {
		var from string
		err := tx.QueryRow(r.Context(), `SELECT status FROM payment_intents WHERE id=$1::uuid`, req.PaymentIntentID).Scan(&from)
		if err != nil {
			return err
		}
		_, err = tx.Exec(r.Context(), `
			INSERT INTO payment_state_events (payment_intent_id, from_status, to_status, reason, actor, metadata_json)
			VALUES ($1::uuid,$2,$3,$4,$5,$6::jsonb)`,
			req.PaymentIntentID, from, to, req.Reason, u.Email, `{"manual":true}`)
		if err != nil {
			return err
		}
		paidAt := interface{}(nil)
		if to == domain.StatusPaid {
			paidAt = nowUTC()
			_, err = tx.Exec(r.Context(), `
				UPDATE orders SET status='PAID', updated_at=now()
				WHERE id=(SELECT order_id FROM payment_intents WHERE id=$1::uuid)`, req.PaymentIntentID)
			if err != nil {
				return err
			}
		}
		_, err = tx.Exec(r.Context(), `
			UPDATE payment_intents SET status=$2, paid_at=COALESCE($3::timestamptz, paid_at), updated_at=now()
			WHERE id=$1::uuid`, req.PaymentIntentID, to, paidAt)
		if err != nil {
			return err
		}
		_, err = tx.Exec(r.Context(), `
			INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, reason, metadata_json)
			VALUES ($1::uuid,$2,'payment_intent',$3,$4,$5::jsonb)`,
			u.ID, req.Action, req.PaymentIntentID, req.Reason, `{"event_id":"`+req.ChainEventID+`"}`)
		return err
	})
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "status": to})
}
