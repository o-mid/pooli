package httpapi

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/pooli-shop/pooli/internal/auth"
)

func (s *Server) handleTelegramMiniappCreateOrder(w http.ResponseWriter, r *http.Request) {
	if !s.Cfg.TelegramEnabled || strings.TrimSpace(s.Cfg.TelegramBotToken) == "" {
		writeErr(w, http.StatusForbidden, "telegram disabled")
		return
	}
	initData := strings.TrimSpace(r.Header.Get("X-Telegram-Init-Data"))
	user, err := auth.ValidateTelegramInitData(initData, s.Cfg.TelegramBotToken, time.Now().UTC(), auth.TelegramInitDataMaxAge)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err.Error())
		return
	}

	var merchantID string
	err = s.Pool.QueryRow(r.Context(), `
		SELECT merchant_id::text FROM telegram_connections
		WHERE telegram_user_id=$1 AND enabled=true`, strconv.FormatInt(user.ID, 10)).Scan(&merchantID)
	if err != nil || merchantID == "" {
		writeErr(w, http.StatusForbidden, "Open Pooli and Connect Telegram")
		return
	}

	var req struct {
		FiatAmountToman int64  `json:"fiat_amount_toman"`
		Title           string `json:"title"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	title := strings.TrimSpace(req.Title)
	created, err := s.createOrderWithIntent(r.Context(), CreateOrderInput{
		MerchantID:      merchantID,
		FiatAmountToman: req.FiatAmountToman,
		Title:           title,
		CreateIntent:    true,
		Source:          orderSourceTelegramMiniapp,
	})
	if err != nil {
		if err == errAmountRequired {
			writeErr(w, http.StatusBadRequest, "amount required")
			return
		}
		if err == errMerchantSuspended {
			writeErr(w, http.StatusForbidden, err.Error())
			return
		}
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	base := strings.TrimRight(s.Cfg.PublicBaseURL, "/")
	writeJSON(w, http.StatusCreated, map[string]any{
		"slug":                  created.Slug,
		"checkout_url":          base + "/p/" + created.Slug,
		"telegram_checkout_url": base + "/t/p/" + created.Slug,
		"id":                    created.ID,
		"fiat_amount_toman":     created.FiatAmount,
	})
}
