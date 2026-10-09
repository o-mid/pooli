package ops

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/pooli-shop/pooli/internal/testutil"
)

func TestGateCursorSnapRefusesActiveOptionAndRecordsGap(t *testing.T) {
	pool := testutil.Connect(t)
	testutil.Reset(t, pool)
	ctx := context.Background()

	if err := GateCursorSnap(ctx, pool, "bsc", 10, 20, "cursor_lag_exceeds_max_catchup"); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM watcher_gaps WHERE network='bsc' AND acknowledged_at IS NULL`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("gaps=%d", n)
	}
	again := GateCursorSnap(ctx, pool, "bsc", 21, 30, "cursor_lag_exceeds_max_catchup")
	if again != nil {
		t.Fatal(again)
	}

	email := "gap-" + uuid.NewString()[:8] + "@pooli.test"
	var userID, merchantID string
	if err := pool.QueryRow(ctx, `INSERT INTO users (email, password_hash, name) VALUES ($1,'x','T') RETURNING id::text`, email).Scan(&userID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO merchants (name, slug) VALUES ('Gap', $1) RETURNING id::text`, "g-"+uuid.NewString()[:8]).Scan(&merchantID); err != nil {
		t.Fatal(err)
	}
	var orderID, quoteID, intentID string
	if err := pool.QueryRow(ctx, `INSERT INTO orders (merchant_id, slug, title, fiat_amount_toman, status) VALUES ($1::uuid,$2,'t',1,'AWAITING_PAYMENT') RETURNING id::text`, merchantID, uuid.NewString()[:10]).Scan(&orderID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO exchange_rate_quotes (usdt_tmn_rate, source, fetched_at) VALUES (126000,'mock',now()) RETURNING id::text`).Scan(&quoteID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `
		INSERT INTO payment_intents (merchant_id, order_id, fiat_amount_toman, status, quote_id, expires_at)
		VALUES ($1::uuid,$2::uuid,1,'AWAITING_PAYMENT',$3::uuid,$4) RETURNING id::text`,
		merchantID, orderID, quoteID, time.Now().Add(time.Hour)).Scan(&intentID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `
		INSERT INTO payment_options (
			payment_intent_id, network, token_contract, destination_address, destination_address_normalized,
			base_usdt_amount_base_units, pay_usdt_amount_base_units, quote_rate, expires_at, status
		) VALUES ($1::uuid,'bsc','0x55','0xabc','0xabc',1,1,'1',$2,'ACTIVE')`, intentID, time.Now().Add(time.Hour)); err != nil {
		t.Fatal(err)
	}

	err := GateCursorSnap(ctx, pool, "bsc", 31, 40, "cursor_lag_exceeds_max_catchup")
	if err != ErrSnapBlocked {
		t.Fatalf("expected snap block, got %v", err)
	}
	if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM watcher_gaps WHERE from_block=31`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatal("refused snap must not write a gap")
	}
}
