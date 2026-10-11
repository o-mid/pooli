package httpapi

import (
	"net/http"
	"strings"

	"github.com/pooli-shop/pooli/internal/notify"
)

func (s *Server) requireAgentGatewaySecret(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cfgSecret := strings.TrimSpace(s.Cfg.AgentGatewaySecret)
		got := strings.TrimSpace(r.Header.Get("X-Pooli-Gateway-Secret"))
		if cfgSecret == "" || got == "" || got != cfgSecret {
			writeErr(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) handleInternalAgentDraftReady(w http.ResponseWriter, r *http.Request) {
	var req struct {
		MerchantID string `json:"merchant_id"`
		OrderID    string `json:"order_id"`
		OrderSlug  string `json:"order_slug"`
		ProposalID string `json:"proposal_id"`
		ConfirmURL string `json:"confirm_url"`
		Locale     string `json:"locale"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	if req.MerchantID == "" || req.OrderID == "" || req.ProposalID == "" {
		writeErr(w, http.StatusBadRequest, "missing fields")
		return
	}
	if s.Telegram != nil {
		_ = s.Telegram.DeliverDraftReady(r.Context(), notify.DraftReadyNotify{
			MerchantID: req.MerchantID,
			OrderID:    req.OrderID,
			OrderSlug:  req.OrderSlug,
			ProposalID: req.ProposalID,
			ConfirmURL: req.ConfirmURL,
			Locale:     req.Locale,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}
