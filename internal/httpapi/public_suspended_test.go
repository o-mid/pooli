package httpapi_test

import (
	"context"
	"testing"
)

func TestSuspendedMerchantPublicCheckoutHidden(t *testing.T) {
	srv, _ := newTestServer(t)
	h := srv.Router()

	cookie := registerMerchant(t, h, "suspended@pooli.test", "Suspended Store")
	_, _, _ = doJSON(t, h, "POST", "/api/v1/wallets", map[string]any{
		"network": "tron", "address": "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf", "label": "Main", "is_default": true,
	}, cookie)
	code, order, _ := doJSON(t, h, "POST", "/api/v1/orders", map[string]any{
		"fiat_amount_toman": 1000000, "title": "Test item",
	}, cookie)
	if code != 201 {
		t.Fatalf("create order %d %v", code, order)
	}
	slug := order["slug"].(string)

	code, pay, _ := doJSON(t, h, "GET", "/api/v1/public/pay/"+slug, nil, nil)
	if code != 200 {
		t.Fatalf("expected checkout before suspend, got %d", code)
	}
	if pay["slug"] != slug {
		t.Fatalf("unexpected payload %v", pay)
	}

	_, err := srv.Pool.Exec(context.Background(), `
		UPDATE merchants SET operational_status='suspended'
		WHERE id=(SELECT merchant_id FROM orders WHERE slug=$1)`, slug)
	if err != nil {
		t.Fatal(err)
	}

	code, _, _ = doJSON(t, h, "GET", "/api/v1/public/pay/"+slug, nil, nil)
	if code != 404 {
		t.Fatalf("suspended merchant checkout must be hidden, got %d", code)
	}

	code, _, _ = doJSON(t, h, "POST", "/api/v1/public/pay/"+slug+"/select-network", map[string]any{
		"network": "tron",
	}, nil)
	if code != 404 {
		t.Fatalf("suspended merchant select-network must be hidden, got %d", code)
	}
}
