package httpapi_test

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/pooli-shop/pooli/internal/instagram"
)

func igWebhookBody(sender, text, mid string, echo, self bool) []byte {
	b, _ := json.Marshal(map[string]any{
		"object": "instagram",
		"entry": []map[string]any{{
			"messaging": []map[string]any{{
				"sender":    map[string]any{"id": sender},
				"timestamp": time.Now().UnixMilli(),
				"message": map[string]any{
					"mid":     mid,
					"text":    text,
					"is_echo": echo,
					"is_self": self,
				},
			}},
		}},
	})
	return b
}

func postIGWebhook(t *testing.T, h http.Handler, body []byte, sig string) int {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/integrations/instagram/webhook", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if sig != "" {
		req.Header.Set("X-Hub-Signature-256", sig)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	return rr.Code
}

func TestInstagramWebhookChallenge(t *testing.T) {
	srv, _ := newTestServer(t)
	srv.Cfg.InstagramWebhookVerifyToken = "verify-me"
	h := srv.Router()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/integrations/instagram/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=abc123", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != 200 {
		t.Fatalf("challenge status %d", rr.Code)
	}
	if ct := rr.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/plain") {
		t.Fatalf("content-type %q", ct)
	}
	if rr.Body.String() != "abc123" {
		t.Fatalf("body %q", rr.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/v1/integrations/instagram/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc123", nil)
	rr = httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != 403 {
		t.Fatalf("bad token want 403 got %d", rr.Code)
	}
}

func TestInstagramDisabledPostNoop(t *testing.T) {
	srv, _ := newTestServer(t)
	h := srv.Router()
	code := postIGWebhook(t, h, igWebhookBody("ig1", "پرداخت", "mid-1", false, false), "")
	if code != 200 {
		t.Fatalf("disabled POST want 200 got %d", code)
	}
	var n int
	_ = srv.Pool.QueryRow(context.Background(), `SELECT COUNT(*) FROM instagram_updates`).Scan(&n)
	if n != 0 {
		t.Fatalf("disabled POST must not process events, got %d", n)
	}
}

func TestInstagramIgnoreEchoAndSelf(t *testing.T) {
	srv, _ := newTestServer(t)
	srv.Cfg.InstagramEnabled = true
	srv.Cfg.InstagramAccessToken = "tok"
	srv.Cfg.InstagramIGUserID = "bot"
	replies := 0
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		replies++
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
	}))
	defer fake.Close()
	srv.Instagram = &instagram.Client{Token: "tok", BaseURL: fake.URL, HTTP: fake.Client()}
	h := srv.Router()

	if c := postIGWebhook(t, h, igWebhookBody("ig1", "hi", "mid-echo", true, false), ""); c != 200 {
		t.Fatalf("echo %d", c)
	}
	if c := postIGWebhook(t, h, igWebhookBody("ig1", "hi", "mid-self", false, true), ""); c != 200 {
		t.Fatalf("self %d", c)
	}
	if replies != 0 {
		t.Fatalf("echo/self must not reply, got %d", replies)
	}
}

func TestInstagramBindAndCreateOnce(t *testing.T) {
	srv, _ := newTestServer(t)
	srv.Cfg.InstagramEnabled = true
	srv.Cfg.InstagramAccessToken = "tok"
	srv.Cfg.InstagramIGUserID = "bot"
	srv.Cfg.InstagramBindCodeTTL = 10 * time.Minute
	var lastText string
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		var body map[string]any
		_ = json.Unmarshal(raw, &body)
		if msg, ok := body["message"].(map[string]any); ok {
			lastText, _ = msg["text"].(string)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
	}))
	defer fake.Close()
	srv.Instagram = &instagram.Client{Token: "tok", BaseURL: fake.URL, HTTP: fake.Client()}
	h := srv.Router()
	cookie := registerMerchant(t, h, "ig@pooli.test", "IG Shop")
	_, _, _ = doJSON(t, h, "POST", "/api/v1/wallets", map[string]any{
		"network": "tron", "address": "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf", "label": "Main", "is_default": true,
	}, cookie)

	code, st, _ := doJSON(t, h, "GET", "/api/v1/integrations/instagram/status", nil, cookie)
	if code != 200 || st["configured"] != true || st["connected"] != false {
		t.Fatalf("status %d %#v", code, st)
	}

	code, bind, _ := doJSON(t, h, "POST", "/api/v1/integrations/instagram/bind-code", map[string]any{}, cookie)
	if code != 200 {
		t.Fatalf("bind-code %d %#v", code, bind)
	}
	rawCode, _ := bind["code"].(string)
	if !strings.HasPrefix(strings.ToUpper(rawCode), "POOLI-") {
		t.Fatalf("code %q", rawCode)
	}

	// Unknown IGSID without a valid code gets help, no order.
	if c := postIGWebhook(t, h, igWebhookBody("ig-unknown", "350000", "mid-help", false, false), ""); c != 200 {
		t.Fatalf("help %d", c)
	}
	if !strings.Contains(lastText, "Settings") {
		t.Fatalf("unknown help %q", lastText)
	}
	var orders int
	_ = srv.Pool.QueryRow(context.Background(), `SELECT COUNT(*) FROM orders`).Scan(&orders)
	if orders != 0 {
		t.Fatal("unbound must not create orders")
	}

	if c := postIGWebhook(t, h, igWebhookBody("ig-seller", rawCode, "mid-bind", false, false), ""); c != 200 {
		t.Fatalf("bind %d", c)
	}
	if !strings.Contains(lastText, "connected") && !strings.Contains(lastText, "متصل") {
		t.Fatalf("bind reply %q", lastText)
	}

	// Reuse fail
	if c := postIGWebhook(t, h, igWebhookBody("ig-other", rawCode, "mid-reuse", false, false), ""); c != 200 {
		t.Fatalf("reuse %d", c)
	}
	if !strings.Contains(lastText, "Settings") {
		t.Fatalf("reuse should ask for settings code, got %q", lastText)
	}

	// Amount without confirm must not create.
	if c := postIGWebhook(t, h, igWebhookBody("ig-seller", "پرداخت", "mid-pay", false, false), ""); c != 200 {
		t.Fatalf("pay %d", c)
	}
	if c := postIGWebhook(t, h, igWebhookBody("ig-seller", "۳۵۰٬۰۰۰", "mid-amt", false, false), ""); c != 200 {
		t.Fatalf("amount %d", c)
	}
	_ = srv.Pool.QueryRow(context.Background(), `SELECT COUNT(*) FROM orders`).Scan(&orders)
	if orders != 0 {
		t.Fatal("unconfirmed amount must not create")
	}

	if c := postIGWebhook(t, h, igWebhookBody("ig-seller", "بله", "mid-yes", false, false), ""); c != 200 {
		t.Fatalf("confirm %d", c)
	}
	if !strings.Contains(lastText, "/p/") {
		t.Fatalf("confirm reply missing checkout %q", lastText)
	}
	var slug, source string
	_ = srv.Pool.QueryRow(context.Background(), `SELECT slug, source FROM orders`).Scan(&slug, &source)
	if slug == "" || source != "instagram_dm" {
		t.Fatalf("order slug=%q source=%q", slug, source)
	}
	if !strings.Contains(lastText, slug) {
		t.Fatalf("reply %q missing slug %s", lastText, slug)
	}

	// Duplicate webhook does not create twice.
	if c := postIGWebhook(t, h, igWebhookBody("ig-seller", "بله", "mid-yes", false, false), ""); c != 200 {
		t.Fatalf("dup %d", c)
	}
	_ = srv.Pool.QueryRow(context.Background(), `SELECT COUNT(*) FROM orders`).Scan(&orders)
	if orders != 1 {
		t.Fatalf("duplicate create want 1 got %d", orders)
	}

	code, st, _ = doJSON(t, h, "GET", "/api/v1/integrations/instagram/status", nil, cookie)
	if code != 200 || st["connected"] != true {
		t.Fatalf("connected status %#v", st)
	}
	code, _, _ = doJSON(t, h, "POST", "/api/v1/integrations/instagram/disconnect", map[string]any{}, cookie)
	if code != 200 {
		t.Fatalf("disconnect %d", code)
	}
}

func TestInstagramBindExpired(t *testing.T) {
	srv, _ := newTestServer(t)
	srv.Cfg.InstagramEnabled = true
	srv.Cfg.InstagramAccessToken = "tok"
	srv.Cfg.InstagramIGUserID = "bot"
	srv.Cfg.InstagramBindCodeTTL = time.Minute
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
	}))
	defer fake.Close()
	srv.Instagram = &instagram.Client{Token: "tok", BaseURL: fake.URL, HTTP: fake.Client()}
	h := srv.Router()
	cookie := registerMerchant(t, h, "igexp@pooli.test", "IG Exp")
	code, bind, _ := doJSON(t, h, "POST", "/api/v1/integrations/instagram/bind-code", map[string]any{}, cookie)
	if code != 200 {
		t.Fatalf("bind-code %d", code)
	}
	rawCode, _ := bind["code"].(string)
	sum := sha256.Sum256([]byte(strings.ToUpper(rawCode)))
	hash := hex.EncodeToString(sum[:])
	_, _ = srv.Pool.Exec(context.Background(), `
		UPDATE instagram_bind_codes SET expires_at=$2 WHERE code_hash=$1`, hash, time.Now().UTC().Add(-time.Minute))
	if c := postIGWebhook(t, h, igWebhookBody("ig-late", rawCode, "mid-exp", false, false), ""); c != 200 {
		t.Fatalf("expired %d", c)
	}
	var n int
	_ = srv.Pool.QueryRow(context.Background(), `SELECT COUNT(*) FROM instagram_connections`).Scan(&n)
	if n != 0 {
		t.Fatal("expired code must not bind")
	}
}

func TestInstagramHubSignatureRejected(t *testing.T) {
	srv, _ := newTestServer(t)
	srv.Cfg.InstagramEnabled = true
	srv.Cfg.InstagramAccessToken = "tok"
	srv.Cfg.InstagramIGUserID = "bot"
	srv.Cfg.InstagramAppSecret = "app-secret"
	h := srv.Router()
	body := igWebhookBody("ig1", "hi", "mid-sig", false, false)
	if c := postIGWebhook(t, h, body, "sha256=deadbeef"); c != 200 {
		t.Fatalf("bad sig %d", c)
	}
	var n int
	_ = srv.Pool.QueryRow(context.Background(), `SELECT COUNT(*) FROM instagram_updates`).Scan(&n)
	if n != 0 {
		t.Fatal("bad signature must not process")
	}
	mac := hmac.New(sha256.New, []byte("app-secret"))
	_, _ = mac.Write(body)
	sig := "sha256=" + hex.EncodeToString(mac.Sum(nil))
	if c := postIGWebhook(t, h, body, sig); c != 200 {
		t.Fatalf("good sig %d", c)
	}
	_ = srv.Pool.QueryRow(context.Background(), `SELECT COUNT(*) FROM instagram_updates`).Scan(&n)
	if n != 1 {
		t.Fatalf("good signature should process, got %d", n)
	}
}
