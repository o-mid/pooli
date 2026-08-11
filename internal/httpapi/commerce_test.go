package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/pooli-shop/pooli/internal/auth"
	"github.com/pooli-shop/pooli/internal/chain"
	"github.com/pooli-shop/pooli/internal/config"
	"github.com/pooli-shop/pooli/internal/domain"
	"github.com/pooli-shop/pooli/internal/httpapi"
	"github.com/pooli-shop/pooli/internal/notify"
	"github.com/pooli-shop/pooli/internal/payment"
	"github.com/pooli-shop/pooli/internal/rate"
	"github.com/pooli-shop/pooli/internal/sse"
	"github.com/pooli-shop/pooli/internal/testutil"
)

func newTestServer(t *testing.T) (*httpapi.Server, *auth.Service) {
	t.Helper()
	pool := testutil.Connect(t)
	testutil.Reset(t, pool)
	cfg := config.Load()
	cfg.EnableChainSimulator = true
	cfg.PublicBaseURL = "http://localhost:3000"
	cfg.RateProvider = "mock"
	cfg.MockUSDTTmnRate = "126000"
	rates, err := rate.BuildProvider("mock", "126000", time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	hub := sse.NewHub()
	matcher := &payment.Matcher{
		Pool: pool, BSCConfirmations: 1, TronConfirmations: 1,
		OnTransition: func(merchantID, intentID, eventType string, payload map[string]any) {
			payment.RecordPaymentTimeline(context.Background(), pool, merchantID, intentID, eventType, payload)
		},
	}
	srv := httpapi.NewServer(cfg, pool, rates, hub, matcher, &notify.Telegram{}, nil, &chain.NoopAdapter{Name: "bsc"}, &chain.NoopAdapter{Name: "tron"})
	return srv, &auth.Service{Pool: pool, AdminEmails: map[string]bool{}}
}

func doJSON(t *testing.T, h http.Handler, method, path string, body any, cookie *http.Cookie) (int, map[string]any, []*http.Cookie) {
	t.Helper()
	var rdr io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rdr = bytes.NewReader(b)
	}
	req := httptest.NewRequest(method, path, rdr)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if cookie != nil {
		req.AddCookie(cookie)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	var out map[string]any
	_ = json.Unmarshal(rr.Body.Bytes(), &out)
	return rr.Code, out, rr.Result().Cookies()
}

func registerMerchant(t *testing.T, h http.Handler, email, store string) *http.Cookie {
	t.Helper()
	code, _, cookies := doJSON(t, h, "POST", "/api/v1/auth/register", map[string]any{
		"email": email, "password": "password123", "name": "Seller", "merchant_name": store,
	}, nil)
	if code != 201 && code != 200 {
		t.Fatalf("register status %d", code)
	}
	for _, c := range cookies {
		if c.Name == auth.CookieName {
			return c
		}
	}
	t.Fatal("missing session cookie")
	return nil
}

func TestCommerceDefaultsQuickPayAndCustomerIsolation(t *testing.T) {
	srv, _ := newTestServer(t)
	h := srv.Router()

	cookieA := registerMerchant(t, h, "a@pooli.test", "Store A")
	cookieB := registerMerchant(t, h, "b@pooli.test", "Store B")

	// Defaults exist and can be patched without mutating later snapshots.
	code, defaults, _ := doJSON(t, h, "GET", "/api/v1/merchant/checkout-defaults", nil, cookieA)
	if code != 200 {
		t.Fatalf("defaults get %d %v", code, defaults)
	}
	code, _, _ = doJSON(t, h, "PATCH", "/api/v1/merchant/checkout-defaults", map[string]any{
		"customer_fields": map[string]string{
			"full_name": "required", "phone": "required", "shipping_address": "optional",
			"postal_code": "disabled", "email": "disabled", "customer_note": "optional",
		},
		"enabled_networks":       []string{"tron"},
		"default_expiry_minutes": 45,
	}, cookieA)
	if code != 200 {
		t.Fatalf("defaults patch %d", code)
	}

	// Wallet required for intent
	code, _, _ = doJSON(t, h, "POST", "/api/v1/wallets", map[string]any{
		"network": "tron", "address": "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf", "label": "Main", "is_default": true,
	}, cookieA)
	if code != 201 {
		t.Fatalf("wallet %d", code)
	}

	code, order, _ := doJSON(t, h, "POST", "/api/v1/orders", map[string]any{
		"fiat_amount_toman": 3800000, "title": "Nike Air Max",
	}, cookieA)
	if code != 201 {
		t.Fatalf("create order %d %v", code, order)
	}
	slug, _ := order["slug"].(string)
	orderID, _ := order["id"].(string)
	if slug == "" || orderID == "" {
		t.Fatalf("missing slug/id: %v", order)
	}

	// Order snapped optional address, no postal (disabled).
	code, detail, _ := doJSON(t, h, "GET", "/api/v1/orders/"+orderID, nil, cookieA)
	if code != 200 {
		t.Fatalf("get order %d", code)
	}
	fields, _ := detail["fields"].([]any)
	keys := map[string]bool{}
	for _, f := range fields {
		m := f.(map[string]any)
		keys[m["key"].(string)] = true
		if m["key"] == "shipping_address" && m["required"] == true {
			t.Fatal("shipping should be optional from defaults snapshot")
		}
	}
	if keys["postal_code"] {
		t.Fatal("postal_code should be disabled and absent from snapshot")
	}
	if !keys["customer_note"] {
		t.Fatal("customer_note should be present")
	}

	// Changing defaults must not mutate existing order fields.
	_, _, _ = doJSON(t, h, "PATCH", "/api/v1/merchant/checkout-defaults", map[string]any{
		"customer_fields": map[string]string{"full_name": "disabled", "phone": "required", "shipping_address": "disabled", "postal_code": "disabled", "email": "disabled", "customer_note": "disabled"},
	}, cookieA)
	code, detail2, _ := doJSON(t, h, "GET", "/api/v1/orders/"+orderID, nil, cookieA)
	if code != 200 {
		t.Fatal(detail2)
	}
	fields2, _ := detail2["fields"].([]any)
	if len(fields2) != len(fields) {
		t.Fatalf("snapshot mutated: before %d after %d", len(fields), len(fields2))
	}

	// Checkout creates customer for merchant A only.
	code, _, _ = doJSON(t, h, "POST", "/api/v1/public/pay/"+slug+"/customer-details", map[string]any{
		"values": map[string]string{
			"full_name": "Sara Ahmadi", "phone": "09121234567",
			"shipping_address": "Tehran Pasdaran", "customer_note": "Size 42",
		},
	}, nil)
	if code != 200 {
		t.Fatalf("customer details %d", code)
	}

	code, custList, _ := doJSON(t, h, "GET", "/api/v1/customers?q=Sara", nil, cookieA)
	if code != 200 {
		t.Fatalf("list customers %d", code)
	}
	customers, _ := custList["customers"].([]any)
	if len(customers) != 1 {
		t.Fatalf("expected 1 customer, got %v", custList)
	}
	custID := customers[0].(map[string]any)["id"].(string)

	code, otherList, _ := doJSON(t, h, "GET", "/api/v1/customers?q=Sara", nil, cookieB)
	if code != 200 {
		t.Fatalf("list B %d", code)
	}
	if len(otherList["customers"].([]any)) != 0 {
		t.Fatal("merchant B must not see merchant A customers")
	}

	code, _, _ = doJSON(t, h, "GET", "/api/v1/customers/"+custID, nil, cookieB)
	if code != 404 {
		t.Fatalf("cross-merchant customer get want 404 got %d", code)
	}

	// Preview must omit PII / amount.
	code, preview, _ := doJSON(t, h, "GET", "/api/v1/public/pay/"+slug+"/preview", nil, nil)
	if code != 200 {
		t.Fatalf("preview %d", code)
	}
	if _, ok := preview["fiat_amount_toman"]; ok {
		t.Fatal("preview must not include amount")
	}
	if _, ok := preview["phone"]; ok {
		t.Fatal("preview must not include phone")
	}
	raw, _ := json.Marshal(preview)
	if bytes.Contains(raw, []byte("Sara")) || bytes.Contains(raw, []byte("0912")) {
		t.Fatalf("preview leaked PII: %s", raw)
	}

	// Public pay must not echo customer field values.
	code, pub, _ := doJSON(t, h, "GET", "/api/v1/public/pay/"+slug, nil, nil)
	if code != 200 {
		t.Fatalf("public pay %d", code)
	}
	if pub["customer_submitted"] != true {
		t.Fatal("expected customer_submitted")
	}
	fv, _ := pub["field_values"].([]any)
	if len(fv) != 0 {
		t.Fatalf("public field_values must be empty, got %v", fv)
	}
}

func TestFulfillmentIndependentOfPaymentAndReceipt(t *testing.T) {
	srv, _ := newTestServer(t)
	h := srv.Router()
	cookie := registerMerchant(t, h, "ship@pooli.test", "Ship Store")
	_, _, _ = doJSON(t, h, "POST", "/api/v1/wallets", map[string]any{
		"network": "tron", "address": "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf", "label": "Main", "is_default": true,
	}, cookie)
	code, order, _ := doJSON(t, h, "POST", "/api/v1/orders", map[string]any{
		"fiat_amount_toman": 1000000, "title": "Shoes", "networks": []string{"tron"},
	}, cookie)
	if code != 201 {
		t.Fatalf("order %d %v", code, order)
	}
	orderID := order["id"].(string)
	slug := order["slug"].(string)

	// Cannot ship before paid.
	code, _, _ = doJSON(t, h, "PATCH", "/api/v1/orders/"+orderID+"/fulfillment", map[string]any{
		"fulfillment_status": "SHIPPED", "shipping_provider": "Iran Post", "tracking_number": "12345678901234567890",
	}, cookie)
	if code != 400 {
		t.Fatalf("ship before paid want 400 got %d", code)
	}

	_, _, _ = doJSON(t, h, "POST", "/api/v1/public/pay/"+slug+"/customer-details", map[string]any{
		"values": map[string]string{"full_name": "Ali", "phone": "09120001122", "shipping_address": "Tehran"},
	}, nil)

	intent := order["payment_intent"].(map[string]any)
	opts := intent["options"].([]any)
	opt := opts[0].(map[string]any)
	payAmt := int64(opt["pay_usdt_amount_base_units"].(float64))
	dest := opt["destination_address"].(string)

	ev := domain.ChainEvent{
		EventID: "sim-fulfill-" + orderID, Network: "tron",
		TxHash: "0xsimfulfill", TokenContract: config.NileUSDTTRC20,
		From: "buyer", To: dest, AmountBaseUnits: payAmt,
		BlockNumber: 1, Confirmations: 99, ObservedAt: time.Now().UTC(),
	}
	if _, err := srv.Matcher.Ingest(context.Background(), ev); err != nil {
		// Matcher is on server but unexported... access via simulate endpoint
		t.Log(err)
	}
	code, sim, _ := doJSON(t, h, "POST", "/api/v1/internal/simulate/chain-event", map[string]any{
		"event_id": ev.EventID, "network": "tron", "tx_hash": ev.TxHash, "token_contract": config.NileUSDTTRC20,
		"from": "buyer", "to": dest, "amount_base_units": payAmt, "block_number": 1, "confirmations": 99,
		"observed_at": time.Now().UTC().Format(time.RFC3339),
	}, nil)
	if code != 200 {
		// Load config may use mainnet contract from env — pull from option
		token := ""
		if v, ok := opt["token_contract"].(string); ok {
			token = v
		}
		code, sim, _ = doJSON(t, h, "POST", "/api/v1/internal/simulate/chain-event", map[string]any{
			"event_id": ev.EventID + "b", "network": "tron", "tx_hash": ev.TxHash + "b", "token_contract": token,
			"from": "buyer", "to": dest, "amount_base_units": payAmt, "block_number": 1, "confirmations": 99,
			"observed_at": time.Now().UTC().Format(time.RFC3339),
		}, nil)
		if code != 200 {
			t.Fatalf("simulate %d %v", code, sim)
		}
	}

	code, detail, _ := doJSON(t, h, "GET", "/api/v1/orders/"+orderID, nil, cookie)
	if code != 200 {
		t.Fatal(detail)
	}
	pi := detail["payment_intent"].(map[string]any)
	if pi["status"] != "PAID" {
		t.Fatalf("want PAID got %v", pi["status"])
	}
	if detail["fulfillment_status"] != "UNFULFILLED" {
		t.Fatalf("fulfillment should stay UNFULFILLED, got %v", detail["fulfillment_status"])
	}
	if detail["receipt"] == nil {
		t.Fatal("expected receipt from verified payment")
	}
	receipt := detail["receipt"].(map[string]any)
	if receipt["tx_hash"] == nil || receipt["tx_hash"] == "" {
		t.Fatalf("receipt missing tx: %v", receipt)
	}

	code, shipped, _ := doJSON(t, h, "PATCH", "/api/v1/orders/"+orderID+"/fulfillment", map[string]any{
		"fulfillment_status": "SHIPPED", "shipping_provider": "Iran Post", "tracking_number": "12345678901234567890",
	}, cookie)
	if code != 200 {
		t.Fatalf("ship %d %v", code, shipped)
	}
	if shipped["fulfillment_status"] != "SHIPPED" {
		t.Fatalf("got %v", shipped["fulfillment_status"])
	}
	// Payment status unchanged.
	if shipped["payment_intent"].(map[string]any)["status"] != "PAID" {
		t.Fatal("payment status must remain PAID")
	}

	code, tl, _ := doJSON(t, h, "GET", "/api/v1/orders/"+orderID+"/timeline", nil, cookie)
	if code != 200 {
		t.Fatal(tl)
	}
	events := tl["timeline"].([]any)
	types := map[string]bool{}
	for _, e := range events {
		types[e.(map[string]any)["event_type"].(string)] = true
	}
	if !types["order.created"] || !types["customer.details_submitted"] || !types["fulfillment.shipped"] {
		t.Fatalf("timeline missing events: %v", types)
	}

	// Public sees tracking, not customer PII.
	code, pub, _ := doJSON(t, h, "GET", "/api/v1/public/pay/"+slug, nil, nil)
	if code != 200 {
		t.Fatal(pub)
	}
	if pub["tracking_number"] != "12345678901234567890" {
		t.Fatalf("tracking %v", pub["tracking_number"])
	}
	if pub["fulfillment_status"] != "SHIPPED" {
		t.Fatalf("fulfill %v", pub["fulfillment_status"])
	}
}

func TestCreateOrderFromCustomer(t *testing.T) {
	srv, _ := newTestServer(t)
	h := srv.Router()
	cookie := registerMerchant(t, h, "fromcust@pooli.test", "Repeat Store")
	_, _, _ = doJSON(t, h, "POST", "/api/v1/wallets", map[string]any{
		"network": "tron", "address": "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf", "label": "Main", "is_default": true,
	}, cookie)
	code, order1, _ := doJSON(t, h, "POST", "/api/v1/orders", map[string]any{
		"fiat_amount_toman": 500000, "title": "First",
	}, cookie)
	if code != 201 {
		t.Fatal(order1)
	}
	slug := order1["slug"].(string)
	_, _, _ = doJSON(t, h, "POST", "/api/v1/public/pay/"+slug+"/customer-details", map[string]any{
		"values": map[string]string{"full_name": "Sara", "phone": "09123334455", "shipping_address": "Tehran"},
	}, nil)
	_, list, _ := doJSON(t, h, "GET", "/api/v1/customers?q=09123334455", nil, cookie)
	custID := list["customers"].([]any)[0].(map[string]any)["id"].(string)

	code, order2, _ := doJSON(t, h, "POST", "/api/v1/orders", map[string]any{
		"fiat_amount_toman": 750000, "title": "Second", "customer_id": custID,
	}, cookie)
	if code != 201 {
		t.Fatalf("create from customer %d %v", code, order2)
	}
	code, detail, _ := doJSON(t, h, "GET", "/api/v1/orders/"+order2["id"].(string), nil, cookie)
	if code != 200 {
		t.Fatal(detail)
	}
	if detail["customer_id"] != custID {
		t.Fatalf("customer_id %v", detail["customer_id"])
	}
}
