package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/pooli-shop/pooli/internal/config"
	"github.com/pooli-shop/pooli/internal/testutil"
)

func TestCheckoutHidesUnhealthyNetworksWithoutMutatingOptions(t *testing.T) {
	pool := testutil.Connect(t)
	testutil.Reset(t, pool)
	ctx := context.Background()

	email := "net-" + uuid.NewString()[:8] + "@pooli.test"
	var userID, merchantID string
	if err := pool.QueryRow(ctx, `INSERT INTO users (email, password_hash, name) VALUES ($1,'x','T') RETURNING id::text`, email).Scan(&userID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO merchants (name, slug) VALUES ('Net', $1) RETURNING id::text`, "n-"+uuid.NewString()[:8]).Scan(&merchantID); err != nil {
		t.Fatal(err)
	}
	slug := uuid.NewString()[:10]
	var orderID, quoteID, intentID, optionID string
	if err := pool.QueryRow(ctx, `
		INSERT INTO orders (merchant_id, slug, title, fiat_amount_toman, status)
		VALUES ($1::uuid,$2,'t',125000,'AWAITING_PAYMENT') RETURNING id::text`, merchantID, slug).Scan(&orderID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO exchange_rate_quotes (usdt_tmn_rate, source, fetched_at) VALUES (10000,'mock',now()) RETURNING id::text`).Scan(&quoteID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `
		INSERT INTO payment_intents (merchant_id, order_id, fiat_amount_toman, status, quote_id, expires_at)
		VALUES ($1::uuid,$2::uuid,125000,'AWAITING_PAYMENT',$3::uuid,$4) RETURNING id::text`,
		merchantID, orderID, quoteID, time.Now().Add(time.Hour)).Scan(&intentID); err != nil {
		t.Fatal(err)
	}
	const payAmount = int64(12450000)
	if err := pool.QueryRow(ctx, `
		INSERT INTO payment_options (
			payment_intent_id, network, token_contract, destination_address, destination_address_normalized,
			base_usdt_amount_base_units, pay_usdt_amount_base_units, quote_rate, expires_at, status
		) VALUES ($1::uuid,'bsc','0x55','0x1111111111111111111111111111111111111111','0x1111111111111111111111111111111111111111',$2,$2,'10000',$3,'ACTIVE')
		RETURNING id::text`, intentID, payAmount, time.Now().Add(time.Hour)).Scan(&optionID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `
		INSERT INTO payment_options (
			payment_intent_id, network, token_contract, destination_address, destination_address_normalized,
			base_usdt_amount_base_units, pay_usdt_amount_base_units, quote_rate, expires_at, status
		) VALUES ($1::uuid,'tron','TR7','TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf','TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf',$2,$2,'10000',$3,'ACTIVE')`,
		intentID, payAmount+1, time.Now().Add(time.Hour)); err != nil {
		t.Fatal(err)
	}

	cfg := config.Load()
	cfg.AppEnv = "development"
	cfg.EnableBSCCheckout = true
	cfg.WatcherStale = 10 * time.Minute
	s := NewServer(cfg, pool, nil, nil, nil, nil, nil, nil, nil)

	_, _ = pool.Exec(ctx, `INSERT INTO watcher_cursors (network, cursor_value, updated_at) VALUES ('tron','1', now()), ('bsc','1', now() - interval '2 hours')`)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/public/pay/"+slug, nil)
	rec := httptest.NewRecorder()
	s.Router().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("public %d %s", rec.Code, rec.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	nets, _ := body["enabled_networks"].([]any)
	if len(nets) != 1 || nets[0] != "tron" {
		t.Fatalf("enabled %#v", nets)
	}
	intent, _ := body["payment_intent"].(map[string]any)
	opts, _ := intent["options"].([]any)
	for _, raw := range opts {
		opt, _ := raw.(map[string]any)
		if opt["network"] == "bsc" {
			t.Fatalf("public payload still offers bsc: %#v", opt)
		}
	}

	raw, _ := json.Marshal(map[string]any{"network": "bsc"})
	req = httptest.NewRequest(http.MethodPost, "/api/v1/public/pay/"+slug+"/select-network", bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	s.Router().ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("select bsc %d %s", rec.Code, rec.Body.String())
	}

	var status string
	var amount int64
	if err := pool.QueryRow(ctx, `SELECT status, pay_usdt_amount_base_units FROM payment_options WHERE id=$1::uuid`, optionID).Scan(&status, &amount); err != nil {
		t.Fatal(err)
	}
	if status != "ACTIVE" || amount != payAmount {
		t.Fatalf("option mutated status=%s amount=%d", status, amount)
	}

	// Flag off hides BSC even with a fresh cursor. TRON stays.
	_, _ = pool.Exec(ctx, `UPDATE watcher_cursors SET updated_at=now() WHERE network='bsc'`)
	cfg.EnableBSCCheckout = false
	s = NewServer(cfg, pool, nil, nil, nil, nil, nil, nil, nil)
	if got := s.effectiveCheckoutNetworks(ctx); len(got) != 1 || got[0] != "tron" {
		t.Fatalf("flag off %#v", got)
	}

	// Symmetric: a stale TRON cursor hides TRON and leaves a healthy BSC.
	cfg.EnableBSCCheckout = true
	s = NewServer(cfg, pool, nil, nil, nil, nil, nil, nil, nil)
	_, _ = pool.Exec(ctx, `UPDATE watcher_cursors SET updated_at=now() - interval '2 hours' WHERE network='tron'`)
	_, _ = pool.Exec(ctx, `UPDATE watcher_cursors SET updated_at=now() WHERE network='bsc'`)
	if got := s.effectiveCheckoutNetworks(ctx); len(got) != 1 || got[0] != "bsc" {
		t.Fatalf("stale tron %#v", got)
	}
}
