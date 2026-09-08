package httpapi_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/pooli-shop/pooli/internal/domain"
)

func TestAgentOrderSnapshotAuth(t *testing.T) {
	srv, _ := newTestServer(t)
	srv.Cfg.AgentGatewaySecret = "test-gateway-secret"
	h := srv.Router()

	cookie := registerMerchant(t, h, "agent@pooli.test", "Agent Store")
	code, _, _ := doJSON(t, h, "POST", "/api/v1/wallets", map[string]any{
		"network": "tron", "address": "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf", "label": "Main", "is_default": true,
	}, cookie)
	if code != 201 {
		t.Fatalf("wallet %d", code)
	}

	code, order, _ := doJSON(t, h, "POST", "/api/v1/orders", map[string]any{
		"amount_usdt_base_units": int64(10_000_000), "title": "Agent hoodie",
	}, cookie)
	if code != 201 {
		t.Fatalf("create order %d %v", code, order)
	}
	orderID, _ := order["id"].(string)
	merchantID := merchantIDFromMe(t, h, cookie)
	path := "/api/v1/agent/merchants/" + merchantID + "/orders/" + orderID + "/snapshot"

	req := httptest.NewRequest(http.MethodGet, path, nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rr.Code)
	}

	req = httptest.NewRequest(http.MethodGet, path, nil)
	req.Header.Set("X-Pooli-Gateway-Secret", "test-gateway-secret")
	req.Header.Set("X-Pooli-Merchant-Id", merchantID)
	rr = httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("snapshot %d %s", rr.Code, rr.Body.String())
	}
	var snap map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &snap); err != nil {
		t.Fatal(err)
	}
	if snap["schema_version"] == "" || snap["slug"] == "" {
		t.Fatalf("incomplete snapshot: %v", snap)
	}
	pay, _ := snap["payment"].(map[string]any)
	if pay == nil || pay["status"] != domain.StatusAwaitingPayment {
		t.Fatalf("payment status: %v", pay)
	}
	if snap["amount_usdt_base_units"].(float64) != 1e7 {
		t.Fatalf("amount: %v", snap["amount_usdt_base_units"])
	}
}

func merchantIDFromMe(t *testing.T, h http.Handler, cookie *http.Cookie) string {
	t.Helper()
	code, body, _ := doJSON(t, h, "GET", "/api/v1/me", nil, cookie)
	if code != 200 {
		t.Fatalf("me %d", code)
	}
	m, _ := body["merchant"].(map[string]any)
	id, _ := m["id"].(string)
	if id == "" {
		t.Fatal("missing merchant id")
	}
	return id
}
