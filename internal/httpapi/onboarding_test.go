package httpapi_test

import (
	"context"
	"testing"

	"github.com/pooli-shop/pooli/internal/auth"
)

func TestOnboardingSlugAndCompletion(t *testing.T) {
	srv, _ := newTestServer(t)
	h := srv.Router()

	c1 := registerMerchant(t, h, "oboard1@example.com", "Tehran Sneakers")
	code, me, _ := doJSON(t, h, "GET", "/api/v1/me", nil, c1)
	if code != 200 {
		t.Fatalf("me %d", code)
	}
	merchant, _ := me["merchant"].(map[string]any)
	if merchant["onboarding_completed"] == true {
		t.Fatalf("new merchant should not be onboarding-complete: %#v", merchant)
	}
	if merchant["operational_status"] != "new" {
		t.Fatalf("expected operational_status=new got %v", merchant["operational_status"])
	}

	code, check, _ := doJSON(t, h, "GET", "/api/v1/merchant/slug/check?slug=app", nil, c1)
	if code != 200 {
		t.Fatalf("slug check %d", code)
	}
	if check["available"] != false {
		t.Fatalf("reserved slug should be unavailable: %#v", check)
	}

	code, sug, _ := doJSON(t, h, "GET", "/api/v1/merchant/slug/suggest?name=Tehran%20Sneakers", nil, c1)
	if code != 200 {
		t.Fatalf("suggest %d", code)
	}
	slug, _ := sug["slug"].(string)
	if slug == "" {
		t.Fatal("empty suggestion")
	}

	code, _, _ = doJSON(t, h, "PATCH", "/api/v1/merchant", map[string]any{
		"display_name": "Tehran Sneakers",
		"slug":         slug,
		"support_email": "hello@tehran.example",
	}, c1)
	if code != 200 {
		t.Fatalf("patch merchant %d", code)
	}

	// Collision: second merchant cannot take same slug.
	c2 := registerMerchant(t, h, "oboard2@example.com", "Other Store")
	code, _, _ = doJSON(t, h, "PATCH", "/api/v1/merchant", map[string]any{
		"slug": slug,
	}, c2)
	if code != 409 {
		t.Fatalf("expected slug conflict 409 got %d", code)
	}

	// Wallet validation: TRON address rejected as BSC.
	code, body, _ := doJSON(t, h, "POST", "/api/v1/wallets", map[string]any{
		"network": "bsc",
		"address": "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf",
		"label":   "bad",
	}, c1)
	if code == 200 || code == 201 {
		t.Fatalf("tron address must not validate as bsc: %d %#v", code, body)
	}

	code, _, _ = doJSON(t, h, "POST", "/api/v1/wallets", map[string]any{
		"network":    "tron",
		"address":    "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf",
		"label":      "Main",
		"is_default": true,
	}, c1)
	if code != 200 && code != 201 {
		t.Fatalf("create wallet %d", code)
	}

	code, _, _ = doJSON(t, h, "PATCH", "/api/v1/merchant/checkout-defaults", map[string]any{
		"default_network":        "tron",
		"default_expiry_minutes": 45,
		"success_message":        "Thanks for your order!",
		"checkout_accent":        "blue",
		"customer_fields": map[string]string{
			"full_name": "required",
			"phone":     "optional",
			"email":     "disabled",
		},
	}, c1)
	if code != 200 {
		t.Fatalf("defaults %d", code)
	}

	code, onb, _ := doJSON(t, h, "GET", "/api/v1/merchant/onboarding", nil, c1)
	if code != 200 {
		t.Fatalf("onboarding %d", code)
	}
	steps, _ := onb["steps"].(map[string]any)
	if steps["can_complete"] != true {
		t.Fatalf("expected can_complete: %#v", steps)
	}

	code, done, _ := doJSON(t, h, "POST", "/api/v1/merchant/onboarding/complete", map[string]any{}, c1)
	if code != 200 {
		t.Fatalf("complete %d %#v", code, done)
	}
	if done["completed"] != true {
		t.Fatalf("expected completed: %#v", done)
	}
	code, me2, _ := doJSON(t, h, "GET", "/api/v1/me", nil, c1)
	if code != 200 {
		t.Fatalf("me2 %d", code)
	}
	m2, _ := me2["merchant"].(map[string]any)
	if m2["onboarding_completed"] != true {
		t.Fatalf("expected onboarding complete: %#v", m2)
	}
	if m2["operational_status"] != "active" {
		t.Fatalf("expected active after complete: %#v", m2)
	}
}

func TestAdminOperationalStatusAudit(t *testing.T) {
	srv, _ := newTestServer(t)
	h := srv.Router()
	// Promote admin by registering then flipping is_admin in DB.
	c := registerMerchant(t, h, "admin-onb@example.com", "Admin Shop")
	pool := srv.Pool
	_, err := pool.Exec(context.Background(), `UPDATE users SET is_admin=true WHERE email=$1`, "admin-onb@example.com")
	if err != nil {
		t.Fatal(err)
	}
	var merchantID string
	_ = pool.QueryRow(context.Background(), `
		SELECT m.id::text FROM merchants m
		JOIN merchant_users mu ON mu.merchant_id=m.id
		JOIN users u ON u.id=mu.user_id
		WHERE u.email=$1`, "admin-onb@example.com").Scan(&merchantID)

	code, out, _ := doJSON(t, h, "PATCH", "/api/v1/admin/merchants/"+merchantID+"/status", map[string]any{
		"operational_status": "review_required",
		"reason":             "manual review",
	}, c)
	if code != 200 {
		t.Fatalf("admin status %d %#v", code, out)
	}
	if out["operational_status"] != "review_required" {
		t.Fatalf("unexpected %#v", out)
	}
	var action string
	_ = pool.QueryRow(context.Background(), `
		SELECT action FROM audit_events WHERE entity_type='merchant' AND entity_id=$1
		ORDER BY created_at DESC LIMIT 1`, merchantID).Scan(&action)
	if action != "set_operational_status" {
		t.Fatalf("audit action %q", action)
	}
}

func TestSlugifyReserved(t *testing.T) {
	if auth.Slugify("Tehran Sneakers") != "tehran-sneakers" {
		t.Fatalf("slugify: %q", auth.Slugify("Tehran Sneakers"))
	}
	if !auth.ReservedMerchantSlugs["admin"] {
		t.Fatal("admin should be reserved")
	}
}
