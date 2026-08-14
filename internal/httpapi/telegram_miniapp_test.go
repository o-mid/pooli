package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/pooli-shop/pooli/internal/auth"
)

func signMiniappInit(t *testing.T, token string, userID int64, authAt time.Time) string {
	t.Helper()
	userJSON, _ := json.Marshal(map[string]any{"id": userID, "username": "seller"})
	return auth.SignTelegramInitData(token, map[string]string{
		"auth_date": strconv.FormatInt(authAt.Unix(), 10),
		"user":      string(userJSON),
	})
}

func doMiniappJSON(t *testing.T, h http.Handler, path string, body any, initData string) (int, map[string]any) {
	t.Helper()
	var rdr io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rdr = bytes.NewReader(b)
	}
	req := httptest.NewRequest(http.MethodPost, path, rdr)
	req.Header.Set("Content-Type", "application/json")
	if initData != "" {
		req.Header.Set("X-Telegram-Init-Data", initData)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	var out map[string]any
	_ = json.Unmarshal(rr.Body.Bytes(), &out)
	return rr.Code, out
}

func TestTelegramMiniappCreateOrder(t *testing.T) {
	srv, _ := newTestServer(t)
	srv.Cfg.TelegramEnabled = true
	srv.Cfg.TelegramBotToken = "mini-bot-token"
	srv.Cfg.PublicBaseURL = "https://pooli.shop"
	h := srv.Router()
	cookie := registerMerchant(t, h, "mini@pooli.test", "Mini Shop")
	_, _, _ = doJSON(t, h, "POST", "/api/v1/wallets", map[string]any{
		"network": "tron", "address": "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf", "label": "Main", "is_default": true,
	}, cookie)

	var merchantID string
	_ = srv.Pool.QueryRow(context.Background(), `
		SELECT m.id::text FROM merchants m
		JOIN merchant_users mu ON mu.merchant_id = m.id
		JOIN users u ON u.id = mu.user_id
		WHERE u.email='mini@pooli.test'`).Scan(&merchantID)
	if merchantID == "" {
		t.Fatal("merchant missing")
	}

	now := time.Now().UTC()
	valid := signMiniappInit(t, "mini-bot-token", 9001, now)

	code, out := doMiniappJSON(t, h, "/api/v1/integrations/telegram/miniapp/orders", map[string]any{
		"fiat_amount_toman": 150000, "title": "Shirt",
	}, valid)
	if code != 403 {
		t.Fatalf("unconnected want 403 got %d %#v", code, out)
	}

	_, _ = srv.Pool.Exec(context.Background(), `
		INSERT INTO telegram_connections (merchant_id, chat_id, telegram_user_id, username, enabled, connected_at)
		VALUES ($1::uuid, '100', '9001', 'seller', true, now())`, merchantID)

	code, out = doMiniappJSON(t, h, "/api/v1/integrations/telegram/miniapp/orders", map[string]any{
		"fiat_amount_toman": 150000, "title": "Shirt",
	}, valid)
	if code != 201 {
		t.Fatalf("create %d %#v", code, out)
	}
	slug, _ := out["slug"].(string)
	if slug == "" {
		t.Fatal("missing slug")
	}
	if out["checkout_url"] != "https://pooli.shop/p/"+slug {
		t.Fatalf("checkout_url %#v", out["checkout_url"])
	}
	if out["telegram_checkout_url"] != "https://pooli.shop/t/p/"+slug {
		t.Fatalf("telegram_checkout_url %#v", out["telegram_checkout_url"])
	}
	var source string
	_ = srv.Pool.QueryRow(context.Background(), `SELECT source FROM orders WHERE slug=$1`, slug).Scan(&source)
	if source != "telegram_miniapp" {
		t.Fatalf("source %q", source)
	}

	// Buyer public pay does not need initData.
	req := httptest.NewRequest(http.MethodGet, "/api/v1/public/pay/"+slug, nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != 200 {
		t.Fatalf("public pay %d %s", rr.Code, rr.Body.String())
	}

	tampered := valid + "x"
	code, _ = doMiniappJSON(t, h, "/api/v1/integrations/telegram/miniapp/orders", map[string]any{
		"fiat_amount_toman": 1000,
	}, tampered)
	if code != 401 {
		t.Fatalf("tampered want 401 got %d", code)
	}

	expired := signMiniappInit(t, "mini-bot-token", 9001, now.Add(-20*time.Minute))
	code, _ = doMiniappJSON(t, h, "/api/v1/integrations/telegram/miniapp/orders", map[string]any{
		"fiat_amount_toman": 1000,
	}, expired)
	if code != 401 {
		t.Fatalf("expired want 401 got %d", code)
	}
}
