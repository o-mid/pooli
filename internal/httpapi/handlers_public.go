package httpapi

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/pooli-shop/pooli/internal/domain"
	"github.com/pooli-shop/pooli/internal/sse"
)

func (s *Server) handlePublicPay(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	pay, err := s.loadPublicBySlug(r.Context(), slug)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	writeJSON(w, http.StatusOK, pay)
}

func (s *Server) handlePublicCustomerDetails(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	var req struct {
		Values map[string]string `json:"values"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	var orderID string
	err := s.Pool.QueryRow(r.Context(), `SELECT id::text FROM orders WHERE slug=$1`, slug).Scan(&orderID)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	defs := s.loadFieldDefs(r.Context(), orderID)
	for _, d := range defs {
		key := d["key"].(string)
		required, _ := d["required"].(bool)
		val := req.Values[key]
		if required && val == "" {
			writeErr(w, http.StatusBadRequest, "missing "+key)
			return
		}
	}
	// Immutable snapshot — reject if already submitted
	var count int
	_ = s.Pool.QueryRow(r.Context(), `SELECT COUNT(*) FROM order_field_values WHERE order_id=$1::uuid`, orderID).Scan(&count)
	if count > 0 {
		writeErr(w, http.StatusConflict, "already submitted")
		return
	}
	for _, d := range defs {
		key := d["key"].(string)
		label := d["label"].(string)
		ftype := d["type"].(string)
		val := req.Values[key]
		_, err = s.Pool.Exec(r.Context(), `
			INSERT INTO order_field_values (order_id, field_key, label, field_type, value)
			VALUES ($1::uuid,$2,$3,$4,$5)`, orderID, key, label, ftype, val)
		if err != nil {
			writeErr(w, http.StatusBadRequest, err.Error())
			return
		}
	}
	pay, _ := s.loadPublicBySlug(r.Context(), slug)
	writeJSON(w, http.StatusOK, pay)
}

func (s *Server) handlePublicSelectNetwork(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	var req struct {
		Network string `json:"network"`
	}
	if err := decodeJSON(r, &req); err != nil || (req.Network != domain.NetworkTRON && req.Network != domain.NetworkBSC) {
		writeErr(w, http.StatusBadRequest, "network required")
		return
	}
	pay, err := s.loadPublicBySlug(r.Context(), slug)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	intent, _ := pay["payment_intent"].(map[string]any)
	if intent == nil {
		writeErr(w, http.StatusBadRequest, "payment intent missing")
		return
	}
	var selected map[string]any
	switch options := intent["options"].(type) {
	case []map[string]any:
		for _, opt := range options {
			if opt["network"] == req.Network {
				selected = opt
				break
			}
		}
	case []any:
		for _, raw := range options {
			opt, _ := raw.(map[string]any)
			if opt != nil && opt["network"] == req.Network {
				selected = opt
				break
			}
		}
	}
	if selected == nil {
		writeErr(w, http.StatusBadRequest, "network unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"selected_option": selected,
		"payment_intent": intent,
		"warning": "Send only USDT on the selected network. Wrong network funds cannot be recovered by Pooli.",
	})
}

func (s *Server) handlePublicSSE(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	var intentID string
	err := s.Pool.QueryRow(r.Context(), `
		SELECT pi.id::text FROM payment_intents pi
		JOIN orders o ON o.id = pi.order_id WHERE o.slug=$1`, slug).Scan(&intentID)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	ch := s.Hub.Subscribe("intent:" + intentID)
	defer s.Hub.Unsubscribe("intent:"+intentID, ch)
	sse.WriteStream(w, r, ch)
}

func (s *Server) handleMerchantSSE(w http.ResponseWriter, r *http.Request) {
	mid, err := s.merchantID(r.Context())
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	ch := s.Hub.Subscribe("merchant:" + mid)
	defer s.Hub.Unsubscribe("merchant:"+mid, ch)
	sse.WriteStream(w, r, ch)
}

func (s *Server) handleTelegramConnect(w http.ResponseWriter, r *http.Request) {
	mid, err := s.merchantID(r.Context())
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	var req struct {
		ChatID string `json:"chat_id"`
	}
	if err := decodeJSON(r, &req); err != nil || req.ChatID == "" {
		writeErr(w, http.StatusBadRequest, "chat_id required")
		return
	}
	_, err = s.Pool.Exec(r.Context(), `
		INSERT INTO telegram_connections (merchant_id, chat_id, enabled)
		VALUES ($1::uuid,$2,true)
		ON CONFLICT (merchant_id) DO UPDATE SET chat_id=EXCLUDED.chat_id, enabled=true`, mid, req.ChatID)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleSimulateChainEvent(w http.ResponseWriter, r *http.Request) {
	if !s.Cfg.EnableChainSimulator {
		writeErr(w, http.StatusForbidden, "simulator disabled")
		return
	}
	var ev domain.ChainEvent
	if err := decodeJSON(r, &ev); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid event")
		return
	}
	if ev.ObservedAt.IsZero() {
		ev.ObservedAt = nowUTC()
	}
	if ev.Confirmations == 0 {
		ev.Confirmations = 99
	}
	res, err := s.Matcher.Ingest(r.Context(), ev)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func (s *Server) handleSimulateConfirmations(w http.ResponseWriter, r *http.Request) {
	if !s.Cfg.EnableChainSimulator {
		writeErr(w, http.StatusForbidden, "simulator disabled")
		return
	}
	var req struct {
		EventID       string `json:"event_id"`
		Confirmations int    `json:"confirmations"`
	}
	if err := decodeJSON(r, &req); err != nil || req.EventID == "" {
		writeErr(w, http.StatusBadRequest, "event_id required")
		return
	}
	if err := s.Matcher.ApplyConfirmations(r.Context(), req.EventID, req.Confirmations); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

