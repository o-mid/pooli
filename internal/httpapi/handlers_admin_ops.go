package httpapi

import (
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

func (s *Server) handleAdminSearch(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if len(q) < 2 {
		writeErr(w, http.StatusBadRequest, "q required (min 2 chars)")
		return
	}
	like := "%" + q + "%"
	out := map[string]any{}

	merchants := []map[string]any{}
	rows, err := s.Pool.Query(r.Context(), `
		SELECT id::text, slug, COALESCE(NULLIF(display_name,''), name), operational_status
		FROM merchants
		WHERE slug ILIKE $1 OR name ILIKE $1 OR display_name ILIKE $1 OR support_email ILIKE $1
		LIMIT 20`, like)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var id, slug, name, status string
			_ = rows.Scan(&id, &slug, &name, &status)
			merchants = append(merchants, map[string]any{"id": id, "slug": slug, "name": name, "operational_status": status})
		}
	}
	out["merchants"] = merchants

	orders := []map[string]any{}
	orows, err := s.Pool.Query(r.Context(), `
		SELECT o.id::text, o.slug, o.title, o.fiat_amount_toman, o.merchant_id::text, COALESCE(pi.status, o.status)
		FROM orders o
		LEFT JOIN payment_intents pi ON pi.order_id = o.id
		WHERE o.slug ILIKE $1 OR o.title ILIKE $1 OR o.merchant_reference ILIKE $1 OR o.id::text = $2
		LIMIT 20`, like, q)
	if err == nil {
		defer orows.Close()
		for orows.Next() {
			var id, slug, title, mid, status string
			var amount int64
			_ = orows.Scan(&id, &slug, &title, &amount, &mid, &status)
			orders = append(orders, map[string]any{
				"id": id, "slug": slug, "title": title, "fiat_amount_toman": amount,
				"merchant_id": mid, "status": status,
			})
		}
	}
	out["orders"] = orders

	intents := []map[string]any{}
	irows, err := s.Pool.Query(r.Context(), `
		SELECT id::text, merchant_id::text, order_id::text, status, fiat_amount_toman
		FROM payment_intents
		WHERE id::text = $1 OR id::text ILIKE $2
		LIMIT 20`, q, like)
	if err == nil {
		defer irows.Close()
		for irows.Next() {
			var id, mid, oid, status string
			var amount int64
			_ = irows.Scan(&id, &mid, &oid, &status, &amount)
			intents = append(intents, map[string]any{
				"id": id, "merchant_id": mid, "order_id": oid, "status": status, "fiat_amount_toman": amount,
			})
		}
	}
	out["payment_intents"] = intents

	txs := []map[string]any{}
	trows, err := s.Pool.Query(r.Context(), `
		SELECT event_id, network, tx_hash, to_address, amount_base_units, confirmations
		FROM chain_events
		WHERE tx_hash ILIKE $1 OR event_id ILIKE $1 OR to_address ILIKE $1
		LIMIT 20`, like)
	if err == nil {
		defer trows.Close()
		for trows.Next() {
			var eid, net, hash, to string
			var amount int64
			var conf int
			_ = trows.Scan(&eid, &net, &hash, &to, &amount, &conf)
			txs = append(txs, map[string]any{
				"event_id": eid, "network": net, "tx_hash": hash, "to_address": to,
				"amount_base_units": amount, "confirmations": conf,
			})
		}
	}
	out["transactions"] = txs

	customers := []map[string]any{}
	crows, err := s.Pool.Query(r.Context(), `
		SELECT id::text, merchant_id::text, full_name, phone_e164, email
		FROM customers
		WHERE full_name ILIKE $1 OR phone_e164 ILIKE $1 OR email ILIKE $1
		LIMIT 20`, like)
	if err == nil {
		defer crows.Close()
		for crows.Next() {
			var id, mid, name, phone, email string
			_ = crows.Scan(&id, &mid, &name, &phone, &email)
			customers = append(customers, map[string]any{
				"id": id, "merchant_id": mid, "full_name": name, "phone": phone, "email": email,
			})
		}
	}
	out["customers"] = customers

	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleAdminPaymentTimeline(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var intentStatus string
	var orderID, merchantID string
	err := s.Pool.QueryRow(r.Context(), `
		SELECT status, order_id::text, merchant_id::text FROM payment_intents WHERE id=$1::uuid`, id).
		Scan(&intentStatus, &orderID, &merchantID)
	if err != nil {
		writeErr(w, http.StatusNotFound, "payment intent not found")
		return
	}

	timeline := []map[string]any{}
	rows, err := s.Pool.Query(r.Context(), `
		SELECT from_status, to_status, reason, actor, metadata_json, created_at
		FROM payment_state_events WHERE payment_intent_id=$1::uuid
		ORDER BY created_at ASC`, id)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var from, to, reason, actor string
			var meta []byte
			var created time.Time
			_ = rows.Scan(&from, &to, &reason, &actor, &meta, &created)
			timeline = append(timeline, map[string]any{
				"kind": "payment_state", "from_status": from, "to_status": to,
				"reason": reason, "actor": actor, "metadata": string(meta), "at": created,
			})
		}
	}

	orows, err := s.Pool.Query(r.Context(), `
		SELECT event_type, source, title, detail, actor, created_at
		FROM order_timeline_events WHERE order_id=$1::uuid ORDER BY created_at ASC`, orderID)
	if err == nil {
		defer orows.Close()
		for orows.Next() {
			var et, source, title, detail, actor string
			var created time.Time
			_ = orows.Scan(&et, &source, &title, &detail, &actor, &created)
			timeline = append(timeline, map[string]any{
				"kind": "order", "event_type": et, "source": source,
				"title": title, "detail": detail, "actor": actor, "at": created,
			})
		}
	}

	drows, err := s.Pool.Query(r.Context(), `
		SELECT channel, event_type, COALESCE(event_key,''), status, attempts,
		       COALESCE(provider,''), COALESCE(provider_message_id,''),
		       COALESCE(last_error_category,''), created_at
		FROM notification_deliveries
		WHERE merchant_id=$1::uuid AND (
			payment_intent_id=$2::uuid OR COALESCE(event_key,'') ILIKE '%' || $2 || '%'
		)
		ORDER BY created_at ASC`, merchantID, id)
	if err == nil {
		defer drows.Close()
		for drows.Next() {
			var ch, et, key, status, provider, pmid, errCat string
			var attempts int
			var created time.Time
			_ = drows.Scan(&ch, &et, &key, &status, &attempts, &provider, &pmid, &errCat, &created)
			timeline = append(timeline, map[string]any{
				"kind": "notification", "channel": ch, "event_type": et, "event_key": key,
				"status": status, "attempts": attempts, "provider": provider,
				"provider_message_id": pmid, "last_error_category": errCat, "at": created,
			})
		}
	}

	var matched any
	_ = s.Pool.QueryRow(r.Context(), `
		SELECT jsonb_build_object(
			'tx_hash', ce.tx_hash, 'network', ce.network, 'amount_base_units', ce.amount_base_units,
			'match_type', mt.match_type, 'matched_at', mt.created_at
		)
		FROM matched_transactions mt
		JOIN chain_events ce ON ce.id = mt.chain_event_id
		WHERE mt.payment_intent_id=$1::uuid LIMIT 1`, id).Scan(&matched)

	writeJSON(w, http.StatusOK, map[string]any{
		"payment_intent_id": id,
		"status":            intentStatus,
		"order_id":          orderID,
		"merchant_id":       merchantID,
		"matched_transaction": matched,
		"timeline":          timeline,
	})
}

func (s *Server) handleAdminExceptions(w http.ResponseWriter, r *http.Request) {
	rows, err := s.Pool.Query(r.Context(), `
		SELECT pi.id::text, pi.merchant_id::text, pi.order_id::text, pi.status, pi.fiat_amount_toman,
		       pi.updated_at, o.slug
		FROM payment_intents pi
		JOIN orders o ON o.id = pi.order_id
		WHERE pi.status IN ('UNDERPAID','OVERPAID','LATE_PAYMENT','NEEDS_REVIEW','DUPLICATE_PAYMENT')
		   OR (pi.status = 'CONFIRMING' AND pi.updated_at < now() - interval '30 minutes')
		ORDER BY pi.updated_at DESC LIMIT 100`)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var id, mid, oid, status, slug string
		var amount int64
		var updated time.Time
		_ = rows.Scan(&id, &mid, &oid, &status, &amount, &updated, &slug)
		label := status
		if status == "CONFIRMING" {
			label = "STUCK_CONFIRMING"
		}
		out = append(out, map[string]any{
			"id": id, "merchant_id": mid, "order_id": oid, "status": status,
			"exception_label": label, "fiat_amount_toman": amount,
			"order_slug": slug, "updated_at": updated,
		})
	}
	if out == nil {
		out = []map[string]any{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"exceptions": out})
}

func (s *Server) handleAdminNotificationDeliveries(w http.ResponseWriter, r *http.Request) {
	rows, err := s.Pool.Query(r.Context(), `
		SELECT id::text, merchant_id::text, channel, event_type, COALESCE(event_key,''), status, attempts,
		       COALESCE(provider,''), COALESCE(provider_message_id,''),
		       COALESCE(last_error_category,''), created_at
		FROM notification_deliveries
		ORDER BY created_at DESC LIMIT 100`)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var id, mid, ch, et, key, status, provider, pmid, errCat string
		var attempts int
		var created time.Time
		_ = rows.Scan(&id, &mid, &ch, &et, &key, &status, &attempts, &provider, &pmid, &errCat, &created)
		out = append(out, map[string]any{
			"id": id, "merchant_id": mid, "channel": ch, "event_type": et, "event_key": key,
			"status": status, "attempts": attempts, "provider": provider,
			"provider_message_id": pmid, "last_error_category": errCat,
			"created_at": created,
		})
	}
	if out == nil {
		out = []map[string]any{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"deliveries": out})
}

func (s *Server) handleAdminRetryDelivery(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var status, channel, eventKey string
	err := s.Pool.QueryRow(r.Context(), `
		SELECT status, channel, event_key FROM notification_deliveries WHERE id=$1::uuid`, id).
		Scan(&status, &channel, &eventKey)
	if err != nil {
		writeErr(w, http.StatusNotFound, "delivery not found")
		return
	}
	if status == "delivered" {
		writeErr(w, http.StatusConflict, "already delivered — retry would risk duplicates")
		return
	}
	// Safe retry: reset failed rows to pending; dispatcher/workers pick up by event_key uniqueness.
	_, err = s.Pool.Exec(r.Context(), `
		UPDATE notification_deliveries
		SET status='pending', last_error='', last_error_category=''
		WHERE id=$1::uuid AND status IN ('failed','pending')`, id)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok": true, "id": id, "channel": channel, "event_key": eventKey, "status": "pending",
	})
}
