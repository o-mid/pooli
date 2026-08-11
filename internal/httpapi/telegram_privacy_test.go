package httpapi_test

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestMeDoesNotExposeTelegramChatID(t *testing.T) {
	srv, _ := newTestServer(t)
	h := srv.Router()
	c := registerMerchant(t, h, "tgpriv@example.com", "TG Priv")
	var mid string
	err := srv.Pool.QueryRow(t.Context(), `
		SELECT m.id::text FROM merchants m
		JOIN merchant_users mu ON mu.merchant_id=m.id
		JOIN users u ON u.id=mu.user_id
		WHERE u.email=$1`, "tgpriv@example.com").Scan(&mid)
	if err != nil {
		t.Fatal(err)
	}
	_, err = srv.Pool.Exec(t.Context(), `
		INSERT INTO telegram_connections (merchant_id, chat_id, username, enabled, connected_at)
		VALUES ($1::uuid, '123456789', 'seller_user', true, now())`, mid)
	if err != nil {
		t.Fatal(err)
	}
	code, me, _ := doJSON(t, h, "GET", "/api/v1/me", nil, c)
	if code != 200 {
		t.Fatalf("me %d", code)
	}
	merchant, _ := me["merchant"].(map[string]any)
	tg, _ := merchant["telegram"].(map[string]any)
	if _, ok := tg["chat_id"]; ok {
		t.Fatalf("chat_id must not be exposed: %#v", tg)
	}
	if tg["connected"] != true {
		t.Fatalf("expected connected: %#v", tg)
	}
}

func TestTelegramWebhookRejectsBadSecret(t *testing.T) {
	srv, _ := newTestServer(t)
	srv.Cfg.TelegramEnabled = true
	srv.Cfg.TelegramWebhookSecret = "expected-secret"
	req := httptest.NewRequest(http.MethodPost, "/api/v1/integrations/telegram/webhook", bytes.NewReader([]byte(`{}`)))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Telegram-Bot-Api-Secret-Token", "wrong")
	rr := httptest.NewRecorder()
	srv.Router().ServeHTTP(rr, req)
	if rr.Code != http.StatusUnauthorized && rr.Code != http.StatusForbidden {
		t.Fatalf("expected 401/403 got %d body=%s", rr.Code, rr.Body.String())
	}
}
