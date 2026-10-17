package httpapi

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/pooli-shop/pooli/internal/actiongateway"
	"github.com/pooli-shop/pooli/internal/agent"
	"github.com/pooli-shop/pooli/internal/claude"
)

func (s *Server) handleSuggestFollowUp(w http.ResponseWriter, r *http.Request) {
	mid, err := s.merchantID(r.Context())
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	orderID := chi.URLParam(r, "id")
	if orderID == "" {
		writeErr(w, http.StatusBadRequest, "missing order id")
		return
	}

	apiKey := strings.TrimSpace(s.Cfg.AnthropicAPIKey)
	if apiKey == "" {
		writeErr(w, http.StatusServiceUnavailable, "claude drafting is not configured")
		return
	}
	gwURL := strings.TrimSpace(s.Cfg.ActionGatewayInternalURL)
	gwSecret := strings.TrimSpace(s.Cfg.AgentGatewaySecret)
	if gwURL == "" || gwSecret == "" {
		writeErr(w, http.StatusServiceUnavailable, "action gateway is not configured")
		return
	}

	snap, err := agent.BuildOrderSnapshot(r.Context(), s.Pool, mid, orderID, s.Cfg.PublicBaseURL)
	if err != nil {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}

	locale := "en"
	if strings.EqualFold(r.URL.Query().Get("locale"), "fa") {
		locale = "fa"
	}

	draft, err := claude.NewClient(apiKey, s.Cfg.AnthropicModel).DraftBuyerMessage(r.Context(), snap, locale)
	if err != nil {
		writeErr(w, http.StatusBadGateway, "could not generate draft")
		return
	}

	payStatus := strings.ToUpper(strings.TrimSpace(snap.Status))
	if snap.Payment != nil && strings.TrimSpace(snap.Payment.Status) != "" {
		payStatus = strings.ToUpper(strings.TrimSpace(snap.Payment.Status))
	}

	bucket := time.Now().Unix() / 120
	idem := suggestIdempotencyKey(mid, orderID, bucket)

	gw := actiongateway.NewClient(gwURL, gwSecret)
	prop, err := gw.ProposeMessage(r.Context(), actiongateway.ProposeRequest{
		OrderID:        snap.OrderID,
		OrderSlug:      snap.Slug,
		MerchantID:     snap.MerchantID,
		Body:           draft,
		Locale:         locale,
		PaymentStatus:  payStatus,
		IdempotencyKey: idem,
	})
	if err != nil {
		if strings.Contains(err.Error(), "VALIDATION") || strings.Contains(err.Error(), "400") {
			writeErr(w, http.StatusBadRequest, "draft failed safety checks")
			return
		}
		writeErr(w, http.StatusBadGateway, "could not register proposal")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"proposal_id":  prop.ProposalID,
		"body":         draft,
		"confirm_url":  prop.ConfirmURL,
		"deduplicated": prop.Deduplicated,
		"locale":       locale,
	})
}

func suggestIdempotencyKey(merchantID, orderID string, bucket int64) string {
	h := sha256.Sum256([]byte(fmt.Sprintf("suggest:%s:%s:%d", merchantID, orderID, bucket)))
	return "pooli_suggest_" + hex.EncodeToString(h[:16])
}
