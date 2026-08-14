package httpapi_test

import (
	"context"
	"testing"
)

func TestAdminCannotMarkPaidWithoutChain(t *testing.T) {
	srv, _ := newTestServer(t)
	h := srv.Router()
	c := registerMerchant(t, h, "admin-resolve@example.com", "Admin Resolve")
	_, err := srv.Pool.Exec(context.Background(), `UPDATE users SET is_admin=true WHERE email=$1`, "admin-resolve@example.com")
	if err != nil {
		t.Fatal(err)
	}
	_, _, _ = doJSON(t, h, "POST", "/api/v1/wallets", map[string]any{
		"network": "tron", "address": "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf", "label": "Main", "is_default": true,
	}, c)
	code, order, _ := doJSON(t, h, "POST", "/api/v1/orders", map[string]any{
		"fiat_amount_toman": 100000, "title": "Test",
	}, c)
	if code != 201 {
		t.Fatalf("order %d %#v", code, order)
	}
	pi, _ := order["payment_intent"].(map[string]any)
	intentID, _ := pi["id"].(string)
	if intentID == "" {
		t.Fatal("missing intent")
	}

	code, body, _ := doJSON(t, h, "POST", "/api/v1/admin/resolve", map[string]any{
		"payment_intent_id": intentID,
		"action":            "mark_paid",
		"reason":            "trying to bypass",
	}, c)
	if code != 400 {
		t.Fatalf("expected 400 for mark_paid got %d %#v", code, body)
	}

	code, ok, _ := doJSON(t, h, "POST", "/api/v1/admin/resolve", map[string]any{
		"payment_intent_id": intentID,
		"action":            "needs_review",
		"reason":            "investigate underpay",
	}, c)
	if code != 200 {
		t.Fatalf("needs_review %d %#v", code, ok)
	}
	var status string
	_ = srv.Pool.QueryRow(context.Background(), `SELECT status FROM payment_intents WHERE id=$1::uuid`, intentID).Scan(&status)
	if status != "NEEDS_REVIEW" {
		t.Fatalf("status=%s", status)
	}
}
