package payment_test

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pooli-shop/pooli/internal/domain"
	"github.com/pooli-shop/pooli/internal/payment"
	"github.com/pooli-shop/pooli/internal/testutil"
	"github.com/shopspring/decimal"
)

func setup(t *testing.T) *pgxpool.Pool {
	t.Helper()
	pool := testutil.Connect(t)
	testutil.Reset(t, pool)
	return pool
}

func uniqAmount(n int64) int64 {
	return 30_000_000 + n
}

func uniqDest(n byte) string {
	return fmt.Sprintf("0x%02x%038d", n, n)
}

func seedMerchantWallet(t *testing.T, pool *pgxpool.Pool, network, addr, contract string) string {
	t.Helper()
	ctx := context.Background()
	email := fmt.Sprintf("t-%s@pooli.test", uuid.NewString()[:8])
	var userID string
	if err := pool.QueryRow(ctx, `
		INSERT INTO users (email, password_hash, name) VALUES ($1,'x','T') RETURNING id::text`, email).Scan(&userID); err != nil {
		t.Fatal(err)
	}
	var merchantID string
	slug := "m-" + uuid.NewString()[:8]
	if err := pool.QueryRow(ctx, `INSERT INTO merchants (name, slug) VALUES ('Test',$1) RETURNING id::text`, slug).Scan(&merchantID); err != nil {
		t.Fatal(err)
	}
	_, _ = pool.Exec(ctx, `INSERT INTO merchant_users (merchant_id, user_id, role) VALUES ($1::uuid,$2::uuid,'owner')`, merchantID, userID)
	var chainID *int64
	if network == "bsc" {
		c := int64(56)
		chainID = &c
	}
	if _, err := pool.Exec(ctx, `
		INSERT INTO merchant_wallet_addresses (
			merchant_id, network, chain_id, address, address_normalized, asset, contract_address, label, is_default
		) VALUES ($1::uuid,$2,$3,$4,$5,'USDT',$6,'main',true)`,
		merchantID, network, chainID, addr, addr, contract); err != nil {
		t.Fatal(err)
	}
	return merchantID
}

func createIntentWithAmount(t *testing.T, pool *pgxpool.Pool, merchantID, network, dest, contract string, base, pay int64) (string, string) {
	t.Helper()
	ctx := context.Background()
	slug := uuid.NewString()[:10]
	var orderID string
	if err := pool.QueryRow(ctx, `
		INSERT INTO orders (merchant_id, slug, title, fiat_amount_toman, status)
		VALUES ($1::uuid,$2,'t',3800000,'AWAITING_PAYMENT') RETURNING id::text`, merchantID, slug).Scan(&orderID); err != nil {
		t.Fatal(err)
	}
	var quoteID string
	_ = pool.QueryRow(ctx, `
		INSERT INTO exchange_rate_quotes (usdt_tmn_rate, source, fetched_at)
		VALUES ($1,'mock',now()) RETURNING id::text`, decimal.RequireFromString("126000")).Scan(&quoteID)
	var intentID string
	if err := pool.QueryRow(ctx, `
		INSERT INTO payment_intents (merchant_id, order_id, fiat_amount_toman, status, quote_id, expires_at)
		VALUES ($1::uuid,$2::uuid,3800000,'AWAITING_PAYMENT',$3::uuid, now() + interval '30 minutes')
		RETURNING id::text`, merchantID, orderID, quoteID).Scan(&intentID); err != nil {
		t.Fatal(err)
	}
	var chainID *int64
	if network == "bsc" {
		c := int64(56)
		chainID = &c
	}
	var optionID string
	if err := pool.QueryRow(ctx, `
		INSERT INTO payment_options (
			payment_intent_id, network, chain_id, token_contract, destination_address, destination_address_normalized,
			base_usdt_amount_base_units, pay_usdt_amount_base_units, quote_rate, expires_at, status
		) VALUES ($1::uuid,$2,$3,$4,$5,$5,$6,$7,'126000', now() + interval '30 minutes','ACTIVE')
		RETURNING id::text`, intentID, network, chainID, contract, dest, base, pay).Scan(&optionID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `
		INSERT INTO amount_reservations (
			payment_option_id, destination_address_normalized, network, token_contract, pay_amount_base_units, status, expires_at
		) VALUES ($1::uuid,$2,$3,$4,$5,'active', now() + interval '30 minutes')`, optionID, dest, network, contract, pay); err != nil {
		t.Fatal(err)
	}
	return intentID, optionID
}

func bscEvent(dest, contract string, amount int64, conf int) domain.ChainEvent {
	chainID := int64(56)
	li := 0
	tx := "0x" + uuid.NewString()
	return domain.ChainEvent{
		EventID: fmt.Sprintf("bsc:%s:0", tx), Network: "bsc", ChainID: &chainID, TxHash: tx, LogIndex: &li,
		TokenContract: contract, From: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", To: dest,
		AmountBaseUnits: amount, BlockNumber: 100, Confirmations: conf, ObservedAt: time.Now().UTC(),
	}
}

func TestExactPaymentAndIdempotentReplay(t *testing.T) {
	pool := setup(t)
	ctx := context.Background()
	contract := "0x55d398326f99059ff775485246999027b3197955"
	dest := uniqDest(1)
	mid := seedMerchantWallet(t, pool, "bsc", dest, contract)
	pay := uniqAmount(731)
	intentID, _ := createIntentWithAmount(t, pool, mid, "bsc", dest, contract, pay-1, pay)
	m := &payment.Matcher{Pool: pool, BSCConfirmations: 1, TronConfirmations: 1}
	ev := bscEvent(dest, contract, pay, 20)
	res, err := m.Ingest(ctx, ev)
	if err != nil {
		t.Fatal(err)
	}
	if res.NewStatus != domain.StatusPaid || res.PaymentIntentID != intentID {
		t.Fatalf("unexpected result %#v", res)
	}
	res2, err := m.Ingest(ctx, ev)
	if err != nil {
		t.Fatal(err)
	}
	if !res2.Duplicate || !res2.Ignored {
		t.Fatalf("expected idempotent ignore, got %#v", res2)
	}
}

func TestWrongTokenDoesNotSettle(t *testing.T) {
	pool := setup(t)
	ctx := context.Background()
	contract := "0x55d398326f99059ff775485246999027b3197955"
	dest := uniqDest(2)
	mid := seedMerchantWallet(t, pool, "bsc", dest, contract)
	pay := uniqAmount(744)
	intentID, _ := createIntentWithAmount(t, pool, mid, "bsc", dest, contract, pay-1, pay)
	m := &payment.Matcher{Pool: pool, BSCConfirmations: 1}
	ev := bscEvent(dest, "0xdeaddeaddeaddeaddeaddeaddeaddeaddeaddead", pay, 99)
	_, _ = m.Ingest(ctx, ev)
	var status string
	_ = pool.QueryRow(ctx, `SELECT status FROM payment_intents WHERE id=$1::uuid`, intentID).Scan(&status)
	if status == domain.StatusPaid {
		t.Fatal("wrong token must not settle")
	}
}

func TestWrongDestinationDoesNotSettle(t *testing.T) {
	pool := setup(t)
	ctx := context.Background()
	contract := "0x55d398326f99059ff775485246999027b3197955"
	dest := uniqDest(3)
	mid := seedMerchantWallet(t, pool, "bsc", dest, contract)
	pay := uniqAmount(770)
	intentID, _ := createIntentWithAmount(t, pool, mid, "bsc", dest, contract, pay-1, pay)
	m := &payment.Matcher{Pool: pool, BSCConfirmations: 1}
	ev := bscEvent(uniqDest(99), contract, pay, 99)
	_, _ = m.Ingest(ctx, ev)
	var status string
	_ = pool.QueryRow(ctx, `SELECT status FROM payment_intents WHERE id=$1::uuid`, intentID).Scan(&status)
	if status == domain.StatusPaid {
		t.Fatal("wrong destination must not settle")
	}
}

func TestWrongNetworkDoesNotSettle(t *testing.T) {
	pool := setup(t)
	ctx := context.Background()
	contract := "0x55d398326f99059ff775485246999027b3197955"
	dest := uniqDest(4)
	mid := seedMerchantWallet(t, pool, "bsc", dest, contract)
	pay := uniqAmount(780)
	intentID, _ := createIntentWithAmount(t, pool, mid, "bsc", dest, contract, pay-1, pay)
	m := &payment.Matcher{Pool: pool, BSCConfirmations: 1}
	ev := bscEvent(dest, contract, pay, 99)
	ev.Network = "tron"
	ev.EventID = "tron:" + uuid.NewString()
	_, _ = m.Ingest(ctx, ev)
	var status string
	_ = pool.QueryRow(ctx, `SELECT status FROM payment_intents WHERE id=$1::uuid`, intentID).Scan(&status)
	if status == domain.StatusPaid {
		t.Fatal("wrong network must not settle")
	}
}

func TestExpiredBecomesLate(t *testing.T) {
	pool := setup(t)
	ctx := context.Background()
	contract := "0x55d398326f99059ff775485246999027b3197955"
	dest := uniqDest(5)
	mid := seedMerchantWallet(t, pool, "bsc", dest, contract)
	pay := uniqAmount(759)
	intentID, _ := createIntentWithAmount(t, pool, mid, "bsc", dest, contract, pay-1, pay)
	_, _ = pool.Exec(ctx, `UPDATE payment_intents SET expires_at = now() - interval '1 minute' WHERE id=$1::uuid`, intentID)
	m := &payment.Matcher{Pool: pool, BSCConfirmations: 1}
	res, err := m.Ingest(ctx, bscEvent(dest, contract, pay, 99))
	if err != nil {
		t.Fatal(err)
	}
	if res.NewStatus != domain.StatusLatePayment {
		t.Fatalf("expected LATE_PAYMENT got %#v", res)
	}
}

func TestUnderpayment(t *testing.T) {
	pool := setup(t)
	ctx := context.Background()
	contract := "0x55d398326f99059ff775485246999027b3197955"
	dest := uniqDest(6)
	mid := seedMerchantWallet(t, pool, "bsc", dest, contract)
	pay := uniqAmount(800)
	intentID, _ := createIntentWithAmount(t, pool, mid, "bsc", dest, contract, pay-1, pay)
	m := &payment.Matcher{Pool: pool, BSCConfirmations: 1}
	res, err := m.Ingest(ctx, bscEvent(dest, contract, pay-50, 99))
	if err != nil {
		t.Fatal(err)
	}
	if res.NewStatus != domain.StatusUnderpaid || res.PaymentIntentID != intentID {
		t.Fatalf("expected UNDERPAID got %#v", res)
	}
}

func TestOverpayment(t *testing.T) {
	pool := setup(t)
	ctx := context.Background()
	contract := "0x55d398326f99059ff775485246999027b3197955"
	dest := uniqDest(7)
	mid := seedMerchantWallet(t, pool, "bsc", dest, contract)
	pay := uniqAmount(810)
	intentID, _ := createIntentWithAmount(t, pool, mid, "bsc", dest, contract, pay-1, pay)
	m := &payment.Matcher{Pool: pool, BSCConfirmations: 1}
	res, err := m.Ingest(ctx, bscEvent(dest, contract, pay+50, 99))
	if err != nil {
		t.Fatal(err)
	}
	if res.NewStatus != domain.StatusOverpaid || res.PaymentIntentID != intentID {
		t.Fatalf("expected OVERPAID got %#v", res)
	}
}

func TestTwoInvoicesUniqueAmounts(t *testing.T) {
	pool := setup(t)
	ctx := context.Background()
	contract := "0x55d398326f99059ff775485246999027b3197955"
	dest := uniqDest(8)
	mid := seedMerchantWallet(t, pool, "bsc", dest, contract)
	base := uniqAmount(820)
	var a, b int64
	if err := payment.WithTx(ctx, pool, func(tx pgx.Tx) (err error) {
		a, err = payment.ReserveUniqueAmount(ctx, tx, dest, "bsc", contract, base, 32)
		return err
	}); err != nil {
		t.Fatal(err)
	}
	createIntentWithAmount(t, pool, mid, "bsc", dest, contract, base, a)
	if err := payment.WithTx(ctx, pool, func(tx pgx.Tx) (err error) {
		b, err = payment.ReserveUniqueAmount(ctx, tx, dest, "bsc", contract, base, 32)
		return err
	}); err != nil {
		t.Fatal(err)
	}
	if a == b {
		t.Fatalf("expected unique amounts, both %d", a)
	}
}

func TestConcurrentReservationAttempts(t *testing.T) {
	pool := setup(t)
	ctx := context.Background()
	contract := "0x55d398326f99059ff775485246999027b3197955"
	dest := uniqDest(9)
	_ = seedMerchantWallet(t, pool, "bsc", dest, contract)
	base := uniqAmount(830)

	var mu sync.Mutex
	seen := map[int64]bool{}
	var wg sync.WaitGroup
	errs := make(chan error, 8)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			var pay int64
			err := payment.WithTx(ctx, pool, func(tx pgx.Tx) error {
				var merchantID, orderID, quoteID, intentID, optionID string
				if err := tx.QueryRow(ctx, `SELECT id::text FROM merchants LIMIT 1`).Scan(&merchantID); err != nil {
					return err
				}
				if err := tx.QueryRow(ctx, `
					INSERT INTO orders (merchant_id, slug, title, fiat_amount_toman, status)
					VALUES ($1::uuid,$2,'c',1,'AWAITING_PAYMENT') RETURNING id::text`, merchantID, uuid.NewString()[:10]).Scan(&orderID); err != nil {
					return err
				}
				if err := tx.QueryRow(ctx, `
					INSERT INTO exchange_rate_quotes (usdt_tmn_rate, source, fetched_at)
					VALUES ('126000','mock',now()) RETURNING id::text`).Scan(&quoteID); err != nil {
					return err
				}
				if err := tx.QueryRow(ctx, `
					INSERT INTO payment_intents (merchant_id, order_id, fiat_amount_toman, status, quote_id, expires_at)
					VALUES ($1::uuid,$2::uuid,1,'AWAITING_PAYMENT',$3::uuid, now() + interval '30 minutes')
					RETURNING id::text`, merchantID, orderID, quoteID).Scan(&intentID); err != nil {
					return err
				}
				if err := tx.QueryRow(ctx, `
					INSERT INTO payment_options (
						payment_intent_id, network, chain_id, token_contract, destination_address, destination_address_normalized,
						base_usdt_amount_base_units, pay_usdt_amount_base_units, quote_rate, expires_at, status
					) VALUES ($1::uuid,'bsc',56,$2,$3,$3,$4,$4,'126000', now() + interval '30 minutes','ACTIVE')
					RETURNING id::text`, intentID, contract, dest, base).Scan(&optionID); err != nil {
					return err
				}
				var err error
				pay, err = payment.ClaimUniqueReservation(ctx, tx, optionID, dest, "bsc", contract, base, time.Now().UTC().Add(30*time.Minute), 64)
				return err
			})
			if err != nil {
				errs <- err
				return
			}
			mu.Lock()
			if seen[pay] {
				errs <- fmt.Errorf("collision on %d", pay)
			}
			seen[pay] = true
			mu.Unlock()
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		t.Fatal(err)
	}
	if len(seen) != 8 {
		t.Fatalf("expected 8 unique reservations, got %d", len(seen))
	}
}

func TestAmbiguousNearbyNeedsReview(t *testing.T) {
	pool := setup(t)
	ctx := context.Background()
	contract := "0x55d398326f99059ff775485246999027b3197955"
	dest := uniqDest(10)
	mid := seedMerchantWallet(t, pool, "bsc", dest, contract)
	base := uniqAmount(840)
	createIntentWithAmount(t, pool, mid, "bsc", dest, contract, base, base+10)
	createIntentWithAmount(t, pool, mid, "bsc", dest, contract, base, base+20)
	m := &payment.Matcher{Pool: pool, BSCConfirmations: 1}
	res, err := m.Ingest(ctx, bscEvent(dest, contract, base+15, 99))
	if err != nil {
		t.Fatal(err)
	}
	if res.NewStatus != domain.StatusNeedsReview {
		t.Fatalf("expected NEEDS_REVIEW got %#v", res)
	}
}

func TestDuplicatePaymentAfterPaid(t *testing.T) {
	pool := setup(t)
	ctx := context.Background()
	contract := "0x55d398326f99059ff775485246999027b3197955"
	dest := uniqDest(11)
	mid := seedMerchantWallet(t, pool, "bsc", dest, contract)
	pay := uniqAmount(850)
	intentID, optionID := createIntentWithAmount(t, pool, mid, "bsc", dest, contract, pay-1, pay)
	m := &payment.Matcher{Pool: pool, BSCConfirmations: 1}
	if _, err := m.Ingest(ctx, bscEvent(dest, contract, pay, 99)); err != nil {
		t.Fatal(err)
	}
	_, _ = pool.Exec(ctx, `UPDATE amount_reservations SET status='active' WHERE payment_option_id=$1::uuid`, optionID)
	_, _ = pool.Exec(ctx, `UPDATE payment_intents SET status='PAID' WHERE id=$1::uuid`, intentID)
	res, err := m.Ingest(ctx, bscEvent(dest, contract, pay, 99))
	if err != nil {
		t.Fatal(err)
	}
	if res.NewStatus != domain.StatusDuplicatePayment {
		t.Fatalf("expected DUPLICATE_PAYMENT got %#v", res)
	}
}

func TestEVMLogIndexIdentity(t *testing.T) {
	pool := setup(t)
	ctx := context.Background()
	contract := "0x55d398326f99059ff775485246999027b3197955"
	dest := uniqDest(12)
	mid := seedMerchantWallet(t, pool, "bsc", dest, contract)
	pay1 := uniqAmount(860)
	pay2 := pay1 + 1
	createIntentWithAmount(t, pool, mid, "bsc", dest, contract, pay1-1, pay1)
	createIntentWithAmount(t, pool, mid, "bsc", dest, contract, pay2-1, pay2)
	m := &payment.Matcher{Pool: pool, BSCConfirmations: 1}
	chainID := int64(56)
	li0, li1 := 0, 1
	tx := "0x" + uuid.NewString()
	ev0 := domain.ChainEvent{
		EventID: fmt.Sprintf("bsc:%s:0", tx), Network: "bsc", ChainID: &chainID, TxHash: tx, LogIndex: &li0,
		TokenContract: contract, From: "0xaaa", To: dest, AmountBaseUnits: pay1, BlockNumber: 1,
		Confirmations: 99, ObservedAt: time.Now().UTC(),
	}
	ev1 := domain.ChainEvent{
		EventID: fmt.Sprintf("bsc:%s:1", tx), Network: "bsc", ChainID: &chainID, TxHash: tx, LogIndex: &li1,
		TokenContract: contract, From: "0xaaa", To: dest, AmountBaseUnits: pay2, BlockNumber: 1,
		Confirmations: 99, ObservedAt: time.Now().UTC(),
	}
	r0, err := m.Ingest(ctx, ev0)
	if err != nil {
		t.Fatal(err)
	}
	r1, err := m.Ingest(ctx, ev1)
	if err != nil {
		t.Fatal(err)
	}
	if r0.PaymentIntentID == "" || r1.PaymentIntentID == "" || r0.PaymentIntentID == r1.PaymentIntentID {
		t.Fatalf("expected two distinct intents, got %#v %#v", r0, r1)
	}
}

func TestMerchantIsolationQuery(t *testing.T) {
	pool := setup(t)
	ctx := context.Background()
	contract := "0x55d398326f99059ff775485246999027b3197955"
	aDest, bDest := uniqDest(13), uniqDest(14)
	a := seedMerchantWallet(t, pool, "bsc", aDest, contract)
	b := seedMerchantWallet(t, pool, "bsc", bDest, contract)
	pay := uniqAmount(870)
	intentA, _ := createIntentWithAmount(t, pool, a, "bsc", aDest, contract, pay-1, pay)
	var other int
	_ = pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM payment_intents WHERE id=$1::uuid AND merchant_id=$2::uuid`, intentA, b).Scan(&other)
	if other != 0 {
		t.Fatal("merchant B must not see merchant A intent")
	}
}

func TestResetClearsLeftoverState(t *testing.T) {
	pool := setup(t)
	ctx := context.Background()
	contract := "0x55d398326f99059ff775485246999027b3197955"
	dest := uniqDest(15)
	mid := seedMerchantWallet(t, pool, "bsc", dest, contract)
	pay := uniqAmount(880)
	createIntentWithAmount(t, pool, mid, "bsc", dest, contract, pay-1, pay)
	var count int
	_ = pool.QueryRow(ctx, `SELECT COUNT(*) FROM amount_reservations`).Scan(&count)
	if count != 1 {
		t.Fatalf("expected 1 reservation, got %d", count)
	}
	testutil.Reset(t, pool)
	_ = pool.QueryRow(ctx, `SELECT COUNT(*) FROM amount_reservations`).Scan(&count)
	if count != 0 {
		t.Fatalf("reset left %d reservations", count)
	}
	_ = pool.QueryRow(ctx, `SELECT COUNT(*) FROM subscription_plans`).Scan(&count)
	if count < 1 {
		t.Fatal("subscription_plans seed should survive reset")
	}
}
