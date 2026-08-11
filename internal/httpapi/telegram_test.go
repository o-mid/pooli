package httpapi_test

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/pooli-shop/pooli/internal/notify"
	"github.com/pooli-shop/pooli/internal/testutil"
)

func uniqueUpdateID(t *testing.T) int64 {
	t.Helper()
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		t.Fatal(err)
	}
	id := int64(binary.BigEndian.Uint64(b[:]) & 0x7fffffffffffffff)
	if id == 0 {
		id = 1
	}
	return id
}

func TestTelegramConnectLinkAndWebhook(t *testing.T) {
	srv, _ := newTestServer(t)
	srv.Cfg.TelegramEnabled = true
	srv.Cfg.TelegramBotUsername = "PooliShopbot"
	srv.Cfg.TelegramWebhookSecret = "whsec-test"
	srv.Cfg.TelegramConnectTokenTTL = 10 * time.Minute

	fakeTG := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.ReadAll(r.Body)
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
	}))
	defer fakeTG.Close()
	srv.Telegram.Enabled = true
	srv.Telegram.Token = "test-token"
	srv.Telegram.APIBase = fakeTG.URL
	srv.Telegram.PublicBase = "https://pooli.shop"

	h := srv.Router()
	cookie := registerMerchant(t, h, "tgconn@pooli.test", "TG Conn")

	code, link, _ := doJSON(t, h, "POST", "/api/v1/telegram/connect-link", map[string]any{}, cookie)
	if code != 200 {
		t.Fatalf("connect-link %d %v", code, link)
	}
	url, _ := link["url"].(string)
	if url == "" {
		t.Fatal("missing url")
	}
	token := url[len("https://t.me/PooliShopbot?start="):]
	sum := sha256.Sum256([]byte(token))
	hash := hex.EncodeToString(sum[:])

	var merchantID string
	_ = srv.Pool.QueryRow(context.Background(), `
		SELECT merchant_id::text FROM telegram_connect_tokens WHERE token_hash=$1`, hash).Scan(&merchantID)
	if merchantID == "" {
		t.Fatal("token not stored")
	}

	_, _ = srv.Pool.Exec(context.Background(), `
		UPDATE telegram_connect_tokens SET expires_at=$2 WHERE token_hash=$1`, hash, time.Now().UTC().Add(-time.Minute))
	expiredUpdateID := uniqueUpdateID(t)
	body, _ := json.Marshal(map[string]any{
		"update_id": expiredUpdateID,
		"message": map[string]any{
			"text": "/start " + token,
			"chat": map[string]any{"id": 555001},
			"from": map[string]any{"id": 555001, "username": "sara_shop"},
		},
	})
	req := httptest.NewRequest("POST", "/api/v1/integrations/telegram/webhook", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Telegram-Bot-Api-Secret-Token", "whsec-test")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != 200 {
		t.Fatalf("webhook expired %d", rr.Code)
	}
	var enabled bool
	_ = srv.Pool.QueryRow(context.Background(), `
		SELECT COALESCE(enabled,false) FROM telegram_connections WHERE merchant_id=$1::uuid`, merchantID).Scan(&enabled)
	if enabled {
		t.Fatal("expired token must not connect")
	}

	code, link, _ = doJSON(t, h, "POST", "/api/v1/telegram/connect-link", map[string]any{}, cookie)
	if code != 200 {
		t.Fatalf("connect-link retry %d %v", code, link)
	}
	token = link["url"].(string)[len("https://t.me/PooliShopbot?start="):]
	connectUpdateID := uniqueUpdateID(t)
	body, _ = json.Marshal(map[string]any{
		"update_id": connectUpdateID,
		"message": map[string]any{
			"text": "/start " + token,
			"chat": map[string]any{"id": 555001},
			"from": map[string]any{"id": 555001, "username": "sara_shop"},
		},
	})
	req = httptest.NewRequest("POST", "/api/v1/integrations/telegram/webhook", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Telegram-Bot-Api-Secret-Token", "whsec-test")
	rr = httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != 200 {
		t.Fatalf("webhook %d %s", rr.Code, rr.Body.String())
	}
	var wh map[string]any
	_ = json.Unmarshal(rr.Body.Bytes(), &wh)
	if wh["connected"] != true {
		t.Fatalf("webhook did not connect: %v", wh)
	}

	code, me, _ := doJSON(t, h, "GET", "/api/v1/me", nil, cookie)
	if code != 200 {
		t.Fatal(me)
	}
	merchant := me["merchant"].(map[string]any)
	tg := merchant["telegram"].(map[string]any)
	if tg["connected"] != true {
		t.Fatalf("not connected: %v", tg)
	}

	// Duplicate update ignored
	req = httptest.NewRequest("POST", "/api/v1/integrations/telegram/webhook", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Telegram-Bot-Api-Secret-Token", "whsec-test")
	rr = httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	var dup map[string]any
	_ = json.Unmarshal(rr.Body.Bytes(), &dup)
	if dup["duplicate"] != true {
		t.Fatalf("expected duplicate update: %v", dup)
	}

	code, _, _ = doJSON(t, h, "POST", "/api/v1/telegram/disconnect", map[string]any{}, cookie)
	if code != 200 {
		t.Fatalf("disconnect %d", code)
	}
}

func TestPaidNotifyOnceAndOutageDoesNotBreakPaid(t *testing.T) {
	pool := testutil.Connect(t)
	testutil.Reset(t, pool)

	var merchantID, orderID, intentID, quoteID string
	_ = pool.QueryRow(context.Background(), `
		INSERT INTO merchants (name, slug) VALUES ('Pay Store','pay-store') RETURNING id::text`).Scan(&merchantID)
	_, _ = pool.Exec(context.Background(), `
		INSERT INTO telegram_connections (merchant_id, chat_id, enabled) VALUES ($1::uuid,'42',true)`, merchantID)
	_ = pool.QueryRow(context.Background(), `
		INSERT INTO exchange_rate_quotes (usdt_tmn_rate, source, fetched_at) VALUES (126000,'mock',now()) RETURNING id::text`).Scan(&quoteID)
	_ = pool.QueryRow(context.Background(), `
		INSERT INTO orders (merchant_id, slug, title, fiat_amount_toman, status)
		VALUES ($1::uuid,'p1','Bag',3800000,'PAID') RETURNING id::text`, merchantID).Scan(&orderID)
	_ = pool.QueryRow(context.Background(), `
		INSERT INTO payment_intents (merchant_id, order_id, fiat_amount_toman, fiat_currency, status, quote_id, expires_at)
		VALUES ($1::uuid,$2::uuid,3800000,'TMN','PAID',$3::uuid,now()+interval '1h') RETURNING id::text`,
		merchantID, orderID, quoteID).Scan(&intentID)

	var sends atomic.Int32
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sends.Add(1)
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
	}))
	defer fake.Close()

	tg := &notify.Telegram{
		Pool: pool, Token: "t", Enabled: true, APIBase: fake.URL, PublicBase: "https://pooli.shop", MaxAttempts: 1,
	}
	ch := notify.Channels{Telegram: tg}
	notify.DispatchTransition(context.Background(), pool, ch, merchantID, intentID, "payment.paid", map[string]any{
		"network": "tron", "amount_base_units": int64(30158731),
	})
	notify.DispatchTransition(context.Background(), pool, ch, merchantID, intentID, "payment.paid", map[string]any{
		"network": "tron", "amount_base_units": int64(30158731),
	})
	if sends.Load() != 1 {
		t.Fatalf("sends=%d", sends.Load())
	}

	down := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "down", 500)
	}))
	defer down.Close()
	tg.APIBase = down.URL
	notify.DispatchTransition(context.Background(), pool, ch, merchantID, intentID, "payment.needs_review", map[string]any{
		"match_type": "UNDERPAID", "amount_base_units": int64(30158000),
	})
	var status string
	_ = pool.QueryRow(context.Background(), `SELECT status FROM payment_intents WHERE id=$1::uuid`, intentID).Scan(&status)
	if status != "PAID" {
		t.Fatalf("status mutated to %s", status)
	}
}
