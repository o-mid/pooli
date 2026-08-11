package httpapi

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/pooli-shop/pooli/internal/domain"
	"github.com/pooli-shop/pooli/internal/payment"
)

var allowedOperationalStatuses = map[string]bool{
	"new": true, "active": true, "review_required": true, "suspended": true,
}

func (s *Server) handleAdminPatchMerchantStatus(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	merchantID := chi.URLParam(r, "id")
	if merchantID == "" {
		writeErr(w, http.StatusBadRequest, "merchant id required")
		return
	}
	var req struct {
		OperationalStatus string `json:"operational_status"`
		Reason            string `json:"reason"`
	}
	if err := decodeJSON(r, &req); err != nil || strings.TrimSpace(req.Reason) == "" {
		writeErr(w, http.StatusBadRequest, "operational_status and reason required")
		return
	}
	status := strings.ToLower(strings.TrimSpace(req.OperationalStatus))
	if !allowedOperationalStatuses[status] {
		writeErr(w, http.StatusBadRequest, "invalid operational_status")
		return
	}
	var from string
	err := s.Pool.QueryRow(r.Context(), `
		SELECT operational_status FROM merchants WHERE id=$1::uuid`, merchantID).Scan(&from)
	if err != nil {
		writeErr(w, http.StatusNotFound, "merchant not found")
		return
	}
	_, err = s.Pool.Exec(r.Context(), `
		UPDATE merchants SET operational_status=$2 WHERE id=$1::uuid`, merchantID, status)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	_, _ = s.Pool.Exec(r.Context(), `
		INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, reason, metadata_json)
		VALUES ($1::uuid,'set_operational_status','merchant',$2,$3,$4::jsonb)`,
		u.ID, merchantID, req.Reason,
		`{"from":"`+from+`","to":"`+status+`"}`)
	writeJSON(w, http.StatusOK, map[string]any{
		"ok": true, "merchant_id": merchantID,
		"operational_status": status, "previous": from,
	})
}

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
		Action          string `json:"action"` // needs_review | acknowledge_exception | note
		Reason          string `json:"reason"`
		ChainEventID    string `json:"event_id"`
	}
	if err := decodeJSON(r, &req); err != nil || req.PaymentIntentID == "" || req.Reason == "" {
		writeErr(w, http.StatusBadRequest, "payment_intent_id and reason required")
		return
	}
	action := strings.TrimSpace(req.Action)
	if action == "" {
		action = "needs_review"
	}
	// SECURITY: Admin must never set PAID without a matcher-verified matched_transaction.
	// Legacy action name mark_paid is rejected explicitly.
	if action == "mark_paid" || action == "force_paid" {
		writeErr(w, http.StatusBadRequest, "manual PAID is forbidden; only chain-verified settlement may mark PAID")
		return
	}
	if action != "needs_review" && action != "acknowledge_exception" && action != "note" {
		writeErr(w, http.StatusBadRequest, "action must be needs_review, acknowledge_exception, or note")
		return
	}

	err := payment.WithTx(r.Context(), s.Pool, func(tx pgx.Tx) error {
		var from string
		err := tx.QueryRow(r.Context(), `SELECT status FROM payment_intents WHERE id=$1::uuid`, req.PaymentIntentID).Scan(&from)
		if err != nil {
			return err
		}
		to := from
		if action == "needs_review" {
			to = domain.StatusNeedsReview
			_, err = tx.Exec(r.Context(), `
				UPDATE payment_intents SET status=$2, updated_at=now() WHERE id=$1::uuid`,
				req.PaymentIntentID, to)
			if err != nil {
				return err
			}
		}
		meta := `{"manual":true,"action":"` + action + `","event_id":"` + strings.ReplaceAll(req.ChainEventID, `"`, "") + `"}`
		_, err = tx.Exec(r.Context(), `
			INSERT INTO payment_state_events (payment_intent_id, from_status, to_status, reason, actor, metadata_json)
			VALUES ($1::uuid,$2,$3,$4,$5,$6::jsonb)`,
			req.PaymentIntentID, from, to, req.Reason, u.Email, meta)
		if err != nil {
			return err
		}
		_, err = tx.Exec(r.Context(), `
			INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, reason, metadata_json)
			VALUES ($1::uuid,$2,'payment_intent',$3,$4,$5::jsonb)`,
			u.ID, action, req.PaymentIntentID, req.Reason, meta)
		return err
	})
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "action": action})
}
