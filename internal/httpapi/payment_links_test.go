package httpapi_test

import (
	"testing"
)

func TestReusablePaymentLinkCreatesFreshIntents(t *testing.T) {
	srv, _ := newTestServer(t)
	h := srv.Router()
	c := registerMerchant(t, h, "links@example.com", "Link Shop")
	_, _, _ = doJSON(t, h, "POST", "/api/v1/merchant/onboarding/complete", map[string]any{}, c)
	// complete may fail without wallet — add wallet first
	_, _, _ = doJSON(t, h, "POST", "/api/v1/wallets", map[string]any{
		"network": "tron", "address": "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf", "label": "Main", "is_default": true,
	}, c)

	code, link, _ := doJSON(t, h, "POST", "/api/v1/payment-links", map[string]any{
		"title": "Consultation", "mode": "fixed", "fiat_amount_toman": 500000, "slug": "consult",
	}, c)
	if code != 201 {
		t.Fatalf("create link %d %#v", code, link)
	}
	slug, _ := link["slug"].(string)

	code, s1, _ := doJSON(t, h, "POST", "/api/v1/public/links/"+slug+"/start", map[string]any{}, nil)
	if code != 201 {
		t.Fatalf("start1 %d %#v", code, s1)
	}
	code, s2, _ := doJSON(t, h, "POST", "/api/v1/public/links/"+slug+"/start", map[string]any{}, nil)
	if code != 201 {
		t.Fatalf("start2 %d %#v", code, s2)
	}
	if s1["slug"] == s2["slug"] {
		t.Fatal("reusable link must create distinct order slugs")
	}
	pi1, _ := s1["payment_intent"].(map[string]any)
	pi2, _ := s2["payment_intent"].(map[string]any)
	if pi1 == nil || pi2 == nil {
		t.Fatalf("missing intents %#v %#v", s1, s2)
	}
	if pi1["id"] == pi2["id"] {
		t.Fatal("must not reuse payment intent")
	}
}

func TestStorePagePayAndIsolation(t *testing.T) {
	srv, _ := newTestServer(t)
	h := srv.Router()
	c1 := registerMerchant(t, h, "store1@example.com", "Tehran Sneakers")
	_, _, _ = doJSON(t, h, "POST", "/api/v1/wallets", map[string]any{
		"network": "tron", "address": "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf", "label": "Main", "is_default": true,
	}, c1)
	_, me, _ := doJSON(t, h, "GET", "/api/v1/me", nil, c1)
	m, _ := me["merchant"].(map[string]any)
	slug, _ := m["slug"].(string)

	c2 := registerMerchant(t, h, "store2@example.com", "Other")
	_, _, _ = doJSON(t, h, "POST", "/api/v1/wallets", map[string]any{
		"network": "tron", "address": "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf", "label": "Main", "is_default": true,
	}, c2)

	code, store, _ := doJSON(t, h, "GET", "/api/v1/public/stores/"+slug, nil, nil)
	if code != 200 {
		t.Fatalf("store get %d", code)
	}
	if store["store_name"] == "" {
		t.Fatalf("missing store %#v", store)
	}

	code, pay, _ := doJSON(t, h, "POST", "/api/v1/public/stores/"+slug+"/pay", map[string]any{
		"fiat_amount_toman": 3800000, "reference": "IG order",
	}, nil)
	if code != 201 {
		t.Fatalf("store pay %d %#v", code, pay)
	}

	// Merchant 2 cannot see merchant 1 orders.
	code, list, _ := doJSON(t, h, "GET", "/api/v1/orders", nil, c2)
	if code != 200 {
		t.Fatalf("list %d", code)
	}
	orders, _ := list["orders"].([]any)
	if len(orders) != 0 {
		t.Fatalf("merchant isolation broken: %#v", orders)
	}
}

func TestCustomAmountLinkBounds(t *testing.T) {
	srv, _ := newTestServer(t)
	h := srv.Router()
	c := registerMerchant(t, h, "custom@example.com", "Custom Shop")
	_, _, _ = doJSON(t, h, "POST", "/api/v1/wallets", map[string]any{
		"network": "tron", "address": "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf", "label": "Main", "is_default": true,
	}, c)
	code, link, _ := doJSON(t, h, "POST", "/api/v1/payment-links", map[string]any{
		"title": "Deposit", "mode": "custom_amount",
		"min_amount_toman": 100000, "max_amount_toman": 1000000, "slug": "deposit",
	}, c)
	if code != 201 {
		t.Fatalf("create %d %#v", code, link)
	}
	slug, _ := link["slug"].(string)
	code, _, _ = doJSON(t, h, "POST", "/api/v1/public/links/"+slug+"/start", map[string]any{
		"fiat_amount_toman": 50000,
	}, nil)
	if code != 400 {
		t.Fatalf("expected below min 400 got %d", code)
	}
	code, ok, _ := doJSON(t, h, "POST", "/api/v1/public/links/"+slug+"/start", map[string]any{
		"fiat_amount_toman": 250000,
	}, nil)
	if code != 201 {
		t.Fatalf("valid custom %d %#v", code, ok)
	}
}
