package httpapi

import (
	"net/http"
	"time"

	"github.com/pooli-shop/pooli/internal/auth"
)

func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email        string `json:"email"`
		Password     string `json:"password"`
		Name         string `json:"name"`
		MerchantName string `json:"merchant_name"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	if req.MerchantName == "" {
		req.MerchantName = req.Name
	}
	u, token, err := s.Auth.Register(r.Context(), req.Email, req.Password, req.Name, req.MerchantName)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	auth.SetSessionCookie(w, token, secureCookie(s.Cfg))
	merchantID, _ := s.Auth.MerchantIDForUser(r.Context(), u.ID)
	writeJSON(w, http.StatusCreated, map[string]any{"user": u, "merchant_id": merchantID})
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	u, token, err := s.Auth.Login(r.Context(), req.Email, req.Password)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err.Error())
		return
	}
	auth.SetSessionCookie(w, token, secureCookie(s.Cfg))
	merchantID, _ := s.Auth.MerchantIDForUser(r.Context(), u.ID)
	writeJSON(w, http.StatusOK, map[string]any{"user": u, "merchant_id": merchantID})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(auth.CookieName); err == nil {
		s.Auth.Logout(r.Context(), c.Value)
	}
	auth.ClearSessionCookie(w)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	u := userFrom(r.Context())
	merchantID, _ := s.Auth.MerchantIDForUser(r.Context(), u.ID)
	var merchantName, displayName, description, logoPath, support, merchantSlug string
	_ = s.Pool.QueryRow(r.Context(), `
		SELECT name, COALESCE(NULLIF(display_name,''), name), description, logo_path, support_contact, slug
		FROM merchants WHERE id=$1::uuid`, merchantID).
		Scan(&merchantName, &displayName, &description, &logoPath, &support, &merchantSlug)
	var telegramChatID, telegramUsername string
	var telegramEnabled bool
	var telegramConnectedAt *time.Time
	_ = s.Pool.QueryRow(r.Context(), `
		SELECT chat_id, COALESCE(username,''), enabled, connected_at
		FROM telegram_connections WHERE merchant_id=$1::uuid`, merchantID).
		Scan(&telegramChatID, &telegramUsername, &telegramEnabled, &telegramConnectedAt)
	logoURL := ""
	if logoPath != "" {
		logoURL = "/api/v1/public/uploads/" + logoPath
	}
	telegram := map[string]any{
		"connected": telegramEnabled && telegramChatID != "",
		"username":  telegramUsername,
		"bot":       s.Cfg.TelegramBotUsername,
	}
	if telegramConnectedAt != nil {
		telegram["connected_at"] = telegramConnectedAt
	}
	var emailPaid, emailAttn, emailOrders bool
	var preferredLocale string
	_ = s.Pool.QueryRow(r.Context(), `
		SELECT notify_email_payment_received, notify_email_payment_attention, notify_email_order_updates, preferred_locale
		FROM merchants WHERE id=$1::uuid`, merchantID).
		Scan(&emailPaid, &emailAttn, &emailOrders, &preferredLocale)
	writeJSON(w, http.StatusOK, map[string]any{
		"user": u,
		"merchant": map[string]any{
			"id": merchantID, "name": merchantName, "display_name": displayName,
			"description": description, "logo_url": logoURL, "support_contact": support,
			"slug":     merchantSlug,
			"telegram": telegram,
			"email_notifications": map[string]any{
				"enabled":          s.Cfg.EmailEnabled,
				"destination":      u.Email,
				"payment_received": emailPaid,
				"needs_attention":  emailAttn,
				"order_updates":    emailOrders,
				"preferred_locale": preferredLocale,
			},
		},
	})
}
