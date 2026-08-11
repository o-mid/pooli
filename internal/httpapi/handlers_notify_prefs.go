package httpapi

import (
	"net/http"
	"strings"
)

func (s *Server) handleGetNotificationPrefs(w http.ResponseWriter, r *http.Request) {
	mid, err := s.merchantID(r.Context())
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	var tgPaid, tgAttn, emailPaid, emailAttn, emailOrders bool
	var locale, ownerEmail string
	err = s.Pool.QueryRow(r.Context(), `
		SELECT m.notify_payment_received, m.notify_payment_attention,
		       m.notify_email_payment_received, m.notify_email_payment_attention, m.notify_email_order_updates,
		       m.preferred_locale,
		       COALESCE((
		         SELECT u.email FROM merchant_users mu
		         JOIN users u ON u.id=mu.user_id
		         WHERE mu.merchant_id=m.id AND mu.role='owner'
		           AND u.email IS NOT NULL AND btrim(u.email)<>''
		         ORDER BY mu.user_id LIMIT 1
		       ),'')
		FROM merchants m WHERE m.id=$1::uuid`, mid).
		Scan(&tgPaid, &tgAttn, &emailPaid, &emailAttn, &emailOrders, &locale, &ownerEmail)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"email_enabled":     s.Cfg.EmailEnabled,
		"email_destination": ownerEmail,
		"preferred_locale":  locale,
		"telegram": map[string]any{
			"payment_received": tgPaid,
			"needs_attention":  tgAttn,
		},
		"email": map[string]any{
			"payment_received": emailPaid,
			"needs_attention":  emailAttn,
			"order_updates":    emailOrders,
		},
	})
}

func (s *Server) handlePatchNotificationPrefs(w http.ResponseWriter, r *http.Request) {
	mid, err := s.merchantID(r.Context())
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	var req struct {
		PreferredLocale *string `json:"preferred_locale"`
		Telegram        *struct {
			PaymentReceived *bool `json:"payment_received"`
			NeedsAttention  *bool `json:"needs_attention"`
		} `json:"telegram"`
		Email *struct {
			PaymentReceived *bool `json:"payment_received"`
			NeedsAttention  *bool `json:"needs_attention"`
			OrderUpdates    *bool `json:"order_updates"`
		} `json:"email"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}

	var locale *string
	if req.PreferredLocale != nil {
		v := strings.ToLower(strings.TrimSpace(*req.PreferredLocale))
		if v != "en" && v != "fa" {
			writeErr(w, http.StatusBadRequest, "preferred_locale must be en or fa")
			return
		}
		locale = &v
	}

	var tgPaid, tgAttn, emailPaid, emailAttn, emailOrders *bool
	if req.Telegram != nil {
		tgPaid = req.Telegram.PaymentReceived
		tgAttn = req.Telegram.NeedsAttention
	}
	if req.Email != nil {
		emailPaid = req.Email.PaymentReceived
		emailAttn = req.Email.NeedsAttention
		emailOrders = req.Email.OrderUpdates
	}

	_, err = s.Pool.Exec(r.Context(), `
		UPDATE merchants SET
			preferred_locale = COALESCE($2, preferred_locale),
			notify_payment_received = COALESCE($3, notify_payment_received),
			notify_payment_attention = COALESCE($4, notify_payment_attention),
			notify_email_payment_received = COALESCE($5, notify_email_payment_received),
			notify_email_payment_attention = COALESCE($6, notify_email_payment_attention),
			notify_email_order_updates = COALESCE($7, notify_email_order_updates)
		WHERE id=$1::uuid`,
		mid, locale, tgPaid, tgAttn, emailPaid, emailAttn, emailOrders)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	s.handleGetNotificationPrefs(w, r)
}
