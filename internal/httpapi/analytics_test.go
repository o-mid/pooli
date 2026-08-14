package httpapi_test

import (
	"context"
	"testing"
)

func TestHomeAnalyticsNoFakeConversion(t *testing.T) {
	srv, _ := newTestServer(t)
	h := srv.Router()
	c := registerMerchant(t, h, "analytics@example.com", "Analytics Shop")
	code, home, _ := doJSON(t, h, "GET", "/api/v1/home", nil, c)
	if code != 200 {
		t.Fatalf("home %d", code)
	}
	analytics, _ := home["analytics"].(map[string]any)
	if analytics == nil {
		t.Fatal("missing analytics")
	}
	if analytics["checkout_conversion"] != nil {
		t.Fatalf("must not invent conversion: %#v", analytics["checkout_conversion"])
	}
	if analytics["gmv_toman_7d"] == nil {
		t.Fatal("missing gmv")
	}
}

func TestCustomerNotesTagsIsolation(t *testing.T) {
	srv, _ := newTestServer(t)
	h := srv.Router()
	c1 := registerMerchant(t, h, "crm1@example.com", "CRM One")
	pool := srv.Pool
	var mid, cid string
	_ = pool.QueryRow(context.Background(), `
		SELECT m.id::text FROM merchants m
		JOIN merchant_users mu ON mu.merchant_id=m.id
		JOIN users u ON u.id=mu.user_id WHERE u.email=$1`, "crm1@example.com").Scan(&mid)
	_ = pool.QueryRow(context.Background(), `
		INSERT INTO customers (merchant_id, full_name, phone_e164, email)
		VALUES ($1::uuid, 'Sara', '+989121111111', 'sara@example.com') RETURNING id::text`, mid).Scan(&cid)

	code, _, _ := doJSON(t, h, "POST", "/api/v1/customers/"+cid+"/notes", map[string]any{
		"body": "VIP Instagram buyer",
	}, c1)
	if code != 201 {
		t.Fatalf("note %d", code)
	}
	code, tags, _ := doJSON(t, h, "POST", "/api/v1/customers/"+cid+"/tags", map[string]any{
		"tag": "VIP",
	}, c1)
	if code != 200 {
		t.Fatalf("tag %d %#v", code, tags)
	}

	c2 := registerMerchant(t, h, "crm2@example.com", "CRM Two")
	code, _, _ = doJSON(t, h, "GET", "/api/v1/customers/"+cid, nil, c2)
	if code != 404 {
		t.Fatalf("expected isolation 404 got %d", code)
	}
}
