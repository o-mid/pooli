package httpapi_test

import (
	"context"
	"testing"

	"github.com/pooli-shop/pooli/internal/email"
	"github.com/pooli-shop/pooli/internal/notify"
	"github.com/pooli-shop/pooli/internal/testutil"
)

func TestEmailPaidIdempotencyAndOutageDoesNotBreakPaid(t *testing.T) {
	pool := testutil.Connect(t)
	testutil.Reset(t, pool)
	ctx := context.Background()

	var userID, merchantID, orderID, intentID, quoteID string
	_ = pool.QueryRow(ctx, `
		INSERT INTO users (email, password_hash, name)
		VALUES ('seller@pooli.test','x','Seller') RETURNING id::text`).Scan(&userID)
	_ = pool.QueryRow(ctx, `
		INSERT INTO merchants (name, slug, preferred_locale)
		VALUES ('Tehran Sneakers','tehran-sneakers','en') RETURNING id::text`).Scan(&merchantID)
	_, _ = pool.Exec(ctx, `
		INSERT INTO merchant_users (merchant_id, user_id, role) VALUES ($1::uuid,$2::uuid,'owner')`,
		merchantID, userID)
	_ = pool.QueryRow(ctx, `
		INSERT INTO exchange_rate_quotes (usdt_tmn_rate, source, fetched_at)
		VALUES (126000,'mock',now()) RETURNING id::text`).Scan(&quoteID)
	_ = pool.QueryRow(ctx, `
		INSERT INTO orders (merchant_id, slug, title, fiat_amount_toman, status, merchant_reference)
		VALUES ($1::uuid,'p1','Bag',3800000,'PAID','1842') RETURNING id::text`, merchantID).Scan(&orderID)
	_, _ = pool.Exec(ctx, `
		INSERT INTO order_field_values (order_id, field_key, label, field_type, value)
		VALUES
		  ($1::uuid,'full_name','Name','text','Sara Ahmadi'),
		  ($1::uuid,'email','Email','email','buyer@example.com')`, orderID)
	_ = pool.QueryRow(ctx, `
		INSERT INTO payment_intents (merchant_id, order_id, fiat_amount_toman, fiat_currency, status, quote_id, expires_at)
		VALUES ($1::uuid,$2::uuid,3800000,'TMN','PAID',$3::uuid,now()+interval '1h') RETURNING id::text`,
		merchantID, orderID, quoteID).Scan(&intentID)
	_, _ = pool.Exec(ctx, `
		INSERT INTO payment_options (
			payment_intent_id, network, token_contract, destination_address, destination_address_normalized,
			base_usdt_amount_base_units, pay_usdt_amount_base_units, quote_rate, expires_at, status
		) VALUES ($1::uuid,'tron','TR7','TDEST','TDEST',29841723,29841723,'126000',now()+interval '1h','SETTLED')`, intentID)

	fake := &email.Fake{}
	mail := &notify.Email{
		Pool: pool, Provider: fake, Enabled: true,
		FromName: "Pooli", FromAddress: "notifications@notify.pooli.shop",
		ReplyTo: "support@pooli.shop", PublicBase: "https://pooli.shop", MaxAttempts: 1,
	}
	ch := notify.Channels{Email: mail}

	notify.DispatchTransition(ctx, pool, ch, merchantID, intentID, "payment.paid", map[string]any{
		"network": "tron", "amount_base_units": int64(29841723),
	})
	notify.DispatchTransition(ctx, pool, ch, merchantID, intentID, "payment.paid", map[string]any{
		"network": "tron", "amount_base_units": int64(29841723),
	})
	if fake.Count() != 2 {
		t.Fatalf("expected merchant+buyer once each, got %d", fake.Count())
	}

	var delivered int
	_ = pool.QueryRow(ctx, `
		SELECT count(*) FROM notification_deliveries
		WHERE merchant_id=$1::uuid AND channel='email' AND status='delivered'`, merchantID).Scan(&delivered)
	if delivered != 2 {
		t.Fatalf("delivered rows=%d", delivered)
	}

	// Preference off → no additional merchant email for a new intent's attention path.
	fake.Reset()
	fake.FailErr = &email.SendError{Category: email.CategoryTransient, StatusCode: 500, Message: "temporary"}
	notify.DispatchTransition(ctx, pool, ch, merchantID, intentID, "payment.needs_review", map[string]any{
		"match_type": "UNDERPAID", "amount_base_units": int64(29840000),
	})
	var status string
	_ = pool.QueryRow(ctx, `SELECT status FROM payment_intents WHERE id=$1::uuid`, intentID).Scan(&status)
	if status != "PAID" {
		t.Fatalf("email outage mutated payment status to %s", status)
	}

	// Disabled merchant email preference — reuse same intent with cleared delivery rows for merchant key only.
	_, _ = pool.Exec(ctx, `UPDATE merchants SET notify_email_payment_received=false WHERE id=$1::uuid`, merchantID)
	fake.Reset()
	fake.FailErr = nil
	_, _ = pool.Exec(ctx, `
		DELETE FROM notification_deliveries
		WHERE merchant_id=$1::uuid AND channel='email' AND event_key=$2`,
		merchantID, "payment.paid:"+intentID+":buyer")
	notify.DispatchTransition(ctx, pool, ch, merchantID, intentID, "payment.paid", map[string]any{
		"network": "tron", "amount_base_units": int64(29841723),
	})
	// Buyer still receives; merchant skipped by preference.
	if fake.Count() != 1 {
		t.Fatalf("expected buyer-only send, got %d", fake.Count())
	}
	if fake.Sent[0].To != "buyer@example.com" {
		t.Fatalf("to=%q", fake.Sent[0].To)
	}
}

func TestEmailPrefsAPIAndMissingBuyerEmail(t *testing.T) {
	srv, _ := newTestServer(t)
	srv.Cfg.EmailEnabled = true
	fake := &email.Fake{}
	srv.Email = &notify.Email{
		Pool: srv.Pool, Provider: fake, Enabled: true,
		PublicBase: "https://pooli.shop", MaxAttempts: 1,
	}
	h := srv.Router()
	cookie := registerMerchant(t, h, "emailprefs@pooli.test", "Email Prefs Store")

	code, prefs, _ := doJSON(t, h, "GET", "/api/v1/merchant/notification-prefs", nil, cookie)
	if code != 200 {
		t.Fatalf("get prefs %d %v", code, prefs)
	}
	if prefs["email_enabled"] != true {
		t.Fatalf("email_enabled=%v", prefs["email_enabled"])
	}
	if prefs["email_destination"] != "emailprefs@pooli.test" {
		t.Fatalf("destination=%v", prefs["email_destination"])
	}

	code, prefs, _ = doJSON(t, h, "PATCH", "/api/v1/merchant/notification-prefs", map[string]any{
		"preferred_locale": "en",
		"email": map[string]any{
			"payment_received": false,
			"needs_attention":  true,
			"order_updates":    false,
		},
	}, cookie)
	if code != 200 {
		t.Fatalf("patch prefs %d %v", code, prefs)
	}
	emailPrefs := prefs["email"].(map[string]any)
	if emailPrefs["payment_received"] != false || emailPrefs["order_updates"] != false {
		t.Fatalf("prefs not saved: %v", emailPrefs)
	}

	// Missing buyer email → only merchant path would send; merchant pref off → zero.
	ctx := context.Background()
	var merchantID, orderID, intentID, quoteID string
	_ = srv.Pool.QueryRow(ctx, `
		SELECT m.id::text FROM merchants m
		JOIN merchant_users mu ON mu.merchant_id=m.id
		JOIN users u ON u.id=mu.user_id WHERE u.email='emailprefs@pooli.test'`).Scan(&merchantID)
	_ = srv.Pool.QueryRow(ctx, `
		INSERT INTO exchange_rate_quotes (usdt_tmn_rate, source, fetched_at)
		VALUES (126000,'mock',now()) RETURNING id::text`).Scan(&quoteID)
	_ = srv.Pool.QueryRow(ctx, `
		INSERT INTO orders (merchant_id, slug, title, fiat_amount_toman, status)
		VALUES ($1::uuid,'no-buyer-mail','Bag',1000,'PAID') RETURNING id::text`, merchantID).Scan(&orderID)
	_ = srv.Pool.QueryRow(ctx, `
		INSERT INTO payment_intents (merchant_id, order_id, fiat_amount_toman, fiat_currency, status, quote_id, expires_at)
		VALUES ($1::uuid,$2::uuid,1000,'TMN','PAID',$3::uuid,now()+interval '1h') RETURNING id::text`,
		merchantID, orderID, quoteID).Scan(&intentID)
	notify.DispatchTransition(ctx, srv.Pool, notify.Channels{Email: srv.Email}, merchantID, intentID, "payment.paid", map[string]any{
		"network": "tron", "amount_base_units": int64(1000000),
	})
	if fake.Count() != 0 {
		t.Fatalf("expected no emails, got %d", fake.Count())
	}
}
