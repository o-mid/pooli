package httpapi_test

import (
	"testing"
	"time"
)

func TestRefreshQuoteCreatesNewActiveOptions(t *testing.T) {
	srv, _ := newTestServer(t)
	h := srv.Router()
	cookie := registerMerchant(t, h, "refresh@pooli.test", "Refresh Store")
	code, _, _ := doJSON(t, h, "POST", "/api/v1/wallets", map[string]any{
		"network": "tron", "address": "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf", "label": "Main", "is_default": true,
	}, cookie)
	if code != 201 {
		t.Fatalf("wallet %d", code)
	}
	code, order, _ := doJSON(t, h, "POST", "/api/v1/orders", map[string]any{
		"fiat_amount_toman": 2500000, "title": "Bag", "networks": []string{"tron"},
	}, cookie)
	if code != 201 {
		t.Fatalf("order %d %v", code, order)
	}
	slug := order["slug"].(string)
	intent := order["payment_intent"].(map[string]any)
	intentID := intent["id"].(string)
	oldOpts := intent["options"].([]any)
	oldOpt := oldOpts[0].(map[string]any)
	oldID := oldOpt["id"].(string)
	oldPay := int64(oldOpt["pay_usdt_amount_base_units"].(float64))

	// Still active — refresh should conflict.
	code, body, _ := doJSON(t, h, "POST", "/api/v1/public/pay/"+slug+"/refresh-quote", map[string]any{}, nil)
	if code != 409 {
		t.Fatalf("expected 409 while active, got %d %v", code, body)
	}

	// Expire intent + reservation like the worker.
	pool := srv.Pool
	_, err := pool.Exec(t.Context(), `
		UPDATE payment_intents SET status='EXPIRED', expires_at=$2, updated_at=now() WHERE id=$1::uuid`,
		intentID, time.Now().UTC().Add(-2*time.Minute))
	if err != nil {
		t.Fatal(err)
	}
	_, err = pool.Exec(t.Context(), `
		UPDATE amount_reservations SET status='released', expires_at=now()
		WHERE payment_option_id=$1::uuid AND status='active'`, oldID)
	if err != nil {
		t.Fatal(err)
	}

	code, refreshed, _ := doJSON(t, h, "POST", "/api/v1/public/pay/"+slug+"/refresh-quote", map[string]any{}, nil)
	if code != 200 {
		t.Fatalf("refresh %d %v", code, refreshed)
	}
	pi := refreshed["payment_intent"].(map[string]any)
	if pi["status"] != "AWAITING_PAYMENT" {
		t.Fatalf("status %v", pi["status"])
	}
	opts := pi["options"].([]any)
	if len(opts) < 2 {
		t.Fatalf("expected superseded + active options, got %d", len(opts))
	}
	var activeID string
	var activePay int64
	var sawOld bool
	for _, raw := range opts {
		o := raw.(map[string]any)
		st, _ := o["status"].(string)
		id, _ := o["id"].(string)
		if id == oldID {
			sawOld = true
			if st != "SUPERSEDED" {
				t.Fatalf("old option status want SUPERSEDED got %s", st)
			}
		}
		if st == "ACTIVE" {
			activeID = id
			activePay = int64(o["pay_usdt_amount_base_units"].(float64))
		}
		if _, ok := o["asset"]; !ok {
			t.Fatal("missing asset on option")
		}
		if _, ok := o["token_decimals"]; !ok {
			t.Fatal("missing token_decimals on option")
		}
	}
	if !sawOld {
		t.Fatal("old option missing from history")
	}
	if activeID == "" || activeID == oldID {
		t.Fatal("expected new ACTIVE option")
	}
	if activePay <= 0 {
		t.Fatal("active pay amount missing")
	}
	_ = oldPay

	// select-network must return ACTIVE option
	code, sel, _ := doJSON(t, h, "POST", "/api/v1/public/pay/"+slug+"/select-network", map[string]any{
		"network": "tron",
	}, nil)
	if code != 200 {
		t.Fatalf("select %d %v", code, sel)
	}
	selected := sel["selected_option"].(map[string]any)
	if selected["id"] != activeID {
		t.Fatalf("select want active %s got %v", activeID, selected["id"])
	}
	if selected["status"] != "ACTIVE" {
		t.Fatalf("selected status %v", selected["status"])
	}
}
