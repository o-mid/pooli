package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/pooli-shop/pooli/internal/domain"
)

func (s *Server) handlePatchFulfillment(w http.ResponseWriter, r *http.Request) {
	mid, err := s.merchantID(r.Context())
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	orderID := chi.URLParam(r, "id")
	var req struct {
		Status           string `json:"fulfillment_status"`
		ShippingProvider string `json:"shipping_provider"`
		TrackingNumber   string `json:"tracking_number"`
		Note             string `json:"fulfillment_note"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	req.Status = strings.ToUpper(strings.TrimSpace(req.Status))
	if req.Status == "" {
		writeErr(w, http.StatusBadRequest, "fulfillment_status required")
		return
	}

	var curStatus, payStatus string
	var merchantOK bool
	err = s.Pool.QueryRow(r.Context(), `
		SELECT o.fulfillment_status, COALESCE(pi.status, o.status), true
		FROM orders o
		LEFT JOIN payment_intents pi ON pi.order_id = o.id
		WHERE o.id=$1::uuid AND o.merchant_id=$2::uuid`, orderID, mid).
		Scan(&curStatus, &payStatus, &merchantOK)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}

	if !domain.CanTransitionFulfillment(curStatus, req.Status) {
		writeErr(w, http.StatusBadRequest, "invalid fulfillment transition")
		return
	}

	// Only paid (or exception settled) orders enter active fulfillment, except cancel.
	if req.Status != domain.FulfillmentCancelled && req.Status != domain.FulfillmentUnfulfilled {
		if payStatus != domain.StatusPaid && payStatus != domain.StatusLatePayment {
			writeErr(w, http.StatusBadRequest, "order must be paid before fulfillment")
			return
		}
	}

	var shippedAt *time.Time
	var deliveredAt *time.Time
	now := time.Now().UTC()
	if req.Status == domain.FulfillmentShipped {
		shippedAt = &now
		if strings.TrimSpace(req.TrackingNumber) == "" && strings.TrimSpace(req.ShippingProvider) == "" {
			// tracking optional but encouraged — allowed empty
		}
	}
	if req.Status == domain.FulfillmentDelivered {
		deliveredAt = &now
	}

	_, err = s.Pool.Exec(r.Context(), `
		UPDATE orders SET
			fulfillment_status=$3,
			shipping_provider = CASE WHEN $4 <> '' THEN $4 ELSE shipping_provider END,
			tracking_number = CASE WHEN $5 <> '' THEN $5 ELSE tracking_number END,
			fulfillment_note = CASE WHEN $6 <> '' THEN $6 ELSE fulfillment_note END,
			shipped_at = COALESCE($7, shipped_at),
			delivered_at = COALESCE($8, delivered_at),
			updated_at = now()
		WHERE id=$1::uuid AND merchant_id=$2::uuid`,
		orderID, mid, req.Status,
		strings.TrimSpace(req.ShippingProvider),
		strings.TrimSpace(req.TrackingNumber),
		strings.TrimSpace(req.Note),
		shippedAt, deliveredAt,
	)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}

	title := "Order " + strings.ToLower(req.Status)
	detail := ""
	if req.Status == domain.FulfillmentShipped {
		title = "Shipped"
		parts := []string{}
		if p := strings.TrimSpace(req.ShippingProvider); p != "" {
			parts = append(parts, p)
		}
		if t := strings.TrimSpace(req.TrackingNumber); t != "" {
			parts = append(parts, t)
		}
		detail = strings.Join(parts, " · ")
	}
	_ = s.appendTimeline(r.Context(), nil, orderID, mid, "fulfillment."+strings.ToLower(req.Status),
		"fulfillment", title, detail, "merchant", map[string]any{
			"from": curStatus, "to": req.Status,
			"shipping_provider": strings.TrimSpace(req.ShippingProvider),
			"tracking_number":   strings.TrimSpace(req.TrackingNumber),
		})

	order, err := s.loadOrderForMerchant(r.Context(), mid, orderID)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
		return
	}
	writeJSON(w, http.StatusOK, order)
}

func (s *Server) handleGetOrderTimeline(w http.ResponseWriter, r *http.Request) {
	mid, err := s.merchantID(r.Context())
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	orderID := chi.URLParam(r, "id")
	var ok bool
	_ = s.Pool.QueryRow(r.Context(), `
		SELECT true FROM orders WHERE id=$1::uuid AND merchant_id=$2::uuid`, orderID, mid).Scan(&ok)
	if !ok {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	events := s.loadTimeline(r.Context(), mid, orderID)
	writeJSON(w, http.StatusOK, map[string]any{"timeline": events})
}

func (s *Server) loadTimeline(ctx context.Context, merchantID, orderID string) []map[string]any {
	rows, err := s.Pool.Query(ctx, `
		SELECT id::text, event_type, source, title, detail, metadata_json, actor, created_at
		FROM order_timeline_events
		WHERE order_id=$1::uuid AND merchant_id=$2::uuid
		ORDER BY created_at ASC, id ASC`, orderID, merchantID)
	if err != nil {
		return []map[string]any{}
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var id, etype, source, title, detail, actor string
		var meta []byte
		var created time.Time
		_ = rows.Scan(&id, &etype, &source, &title, &detail, &meta, &actor, &created)
		var metadata map[string]any
		if len(meta) > 0 {
			_ = json.Unmarshal(meta, &metadata)
		}
		if metadata == nil {
			metadata = map[string]any{}
		}
		out = append(out, map[string]any{
			"id": id, "event_type": etype, "source": source, "title": title,
			"detail": detail, "metadata": metadata, "actor": actor, "created_at": created,
		})
	}
	if out == nil {
		out = []map[string]any{}
	}
	return out
}

// loadTimelinePublic returns buyer-safe timeline (no merchant-only notes).
func (s *Server) loadTimelinePublic(ctx context.Context, orderID string) []map[string]any {
	rows, err := s.Pool.Query(ctx, `
		SELECT event_type, source, title, detail, created_at,
		       COALESCE(metadata_json->>'tracking_number',''),
		       COALESCE(metadata_json->>'shipping_provider','')
		FROM order_timeline_events
		WHERE order_id=$1::uuid
		  AND event_type NOT LIKE 'merchant.%'
		ORDER BY created_at ASC, id ASC`, orderID)
	if err != nil {
		return []map[string]any{}
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var etype, source, title, detail, track, carrier string
		var created time.Time
		_ = rows.Scan(&etype, &source, &title, &detail, &created, &track, &carrier)
		item := map[string]any{
			"event_type": etype, "source": source, "title": title,
			"detail": detail, "created_at": created,
		}
		if track != "" {
			item["tracking_number"] = track
		}
		if carrier != "" {
			item["shipping_provider"] = carrier
		}
		out = append(out, item)
	}
	if out == nil {
		out = []map[string]any{}
	}
	return out
}
