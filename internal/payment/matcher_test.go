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

func releaseExpiredReservation(t *testing.T, pool *pgxpool.Pool, intentID, optionID string, expiredAgo time.Duration) time.Time {
	t.Helper()
	ctx := context.Background()
	expiresAt := time.Now().UTC().Add(-expiredAgo)
	_, err := pool.Exec(ctx, `
		UPDATE payment_intents SET status='EXPIRED', expires_at=$2, updated_at=now() WHERE id=$1::uuid`,
		intentID, expiresAt)
	if err != nil {
		t.Fatal(err)
	}
	_, err = pool.Exec(ctx, `
		UPDATE payment_options SET expires_at=$2 WHERE id=$1::uuid`, optionID, expiresAt)
	if err != nil {
		t.Fatal(err)
	}
	_, err = pool.Exec(ctx, `
		UPDATE amount_reservations
		SET status='released', expires_at=$2
		WHERE payment_option_id=$1::uuid`, optionID, expiresAt)
	if err != nil {
		t.Fatal(err)
	}
	return expiresAt
}

func bscEventAt(dest, contract string, amount int64, conf int, at time.Time) domain.ChainEvent {
	ev := bscEvent(dest, contract, amount, conf)
	ev.ObservedAt = at
	ev.Raw = map[string]any{"block_timestamp": at.UnixMilli()}
	return ev
}

func TestReleasedExactInsideWindowBecomesLate(t *testing.T) {
	pool := setup(t)
	ctx := context.Background()
	contract := "0x55d398326f99059ff775485246999027b3197955"
	dest := uniqDest(31)
	mid := seedMerchantWallet(t, pool, "bsc", dest, contract)
	pay := uniqAmount(931)
	intentID, optionID := createIntentWithAmount(t, pool, mid, "bsc", dest, contract, pay-1, pay)
	expiresAt := releaseExpiredReservation(t, pool, intentID, optionID, 10*time.Minute)
	m := &payment.Matcher{Pool: pool, BSCConfirmations: 12, LateReconcileWindow: 2 * time.Hour}
	ev := bscEventAt(dest, contract, pay, 99, expiresAt.Add(5*time.Minute))
	res, err := m.Ingest(ctx, ev)
	if err != nil {
		t.Fatal(err)
	}
	if res.NewStatus != domain.StatusLatePayment || res.MatchType != "LATE_PAYMENT" || res.PaymentIntentID != intentID {
		t.Fatalf("expected LATE_PAYMENT link got %#v", res)
	}
	var intentStatus, optStatus, resStatus, matchType string
	var usage int
	_ = pool.QueryRow(ctx, `SELECT status FROM payment_intents WHERE id=$1::uuid`, intentID).Scan(&intentStatus)
	_ = pool.QueryRow(ctx, `SELECT status FROM payment_options WHERE id=$1::uuid`, optionID).Scan(&optStatus)
	_ = pool.QueryRow(ctx, `SELECT status FROM amount_reservations WHERE payment_option_id=$1::uuid`, optionID).Scan(&resStatus)
	_ = pool.QueryRow(ctx, `
		SELECT match_type FROM matched_transactions
		WHERE payment_intent_id=$1::uuid AND payment_option_id=$2::uuid`, intentID, optionID).Scan(&matchType)
	_ = pool.QueryRow(ctx, `SELECT COALESCE(SUM(verified_payments),0) FROM usage_counters WHERE merchant_id=$1::uuid`, mid).Scan(&usage)
	if intentStatus != domain.StatusLatePayment || matchType != "LATE_PAYMENT" {
		t.Fatalf("intent/match wrong status=%s match=%s", intentStatus, matchType)
	}
	if optStatus == "SETTLED" || resStatus == "consumed" || usage != 0 {
		t.Fatalf("late must not settle opt=%s res=%s usage=%d", optStatus, resStatus, usage)
	}
	// Confirmations must not promote LATE_PAYMENT to PAID.
	if err := m.ApplyConfirmations(ctx, ev.EventID, 99); err != nil {
		t.Fatal(err)
	}
	_ = pool.QueryRow(ctx, `SELECT status FROM payment_intents WHERE id=$1::uuid`, intentID).Scan(&intentStatus)
	if intentStatus != domain.StatusLatePayment {
		t.Fatalf("ApplyConfirmations must not settle late payment, got %s", intentStatus)
	}
}

func TestReleasedExactLinksCorrectExpiredIntent(t *testing.T) {
	pool := setup(t)
	ctx := context.Background()
	contract := "0x55d398326f99059ff775485246999027b3197955"
	dest := uniqDest(32)
	mid := seedMerchantWallet(t, pool, "bsc", dest, contract)
	payOld := uniqAmount(932)
	payNew := payOld + 5
	oldIntent, oldOpt := createIntentWithAmount(t, pool, mid, "bsc", dest, contract, payOld-1, payOld)
	newIntent, newOpt := createIntentWithAmount(t, pool, mid, "bsc", dest, contract, payNew-1, payNew)
	expiresOld := releaseExpiredReservation(t, pool, oldIntent, oldOpt, 15*time.Minute)
	_ = releaseExpiredReservation(t, pool, newIntent, newOpt, 8*time.Minute)
	m := &payment.Matcher{Pool: pool, BSCConfirmations: 1, LateReconcileWindow: 2 * time.Hour}
	res, err := m.Ingest(ctx, bscEventAt(dest, contract, payOld, 1, expiresOld.Add(2*time.Minute)))
	if err != nil {
		t.Fatal(err)
	}
	if res.PaymentIntentID != oldIntent || res.NewStatus != domain.StatusLatePayment {
		t.Fatalf("expected old intent late link got %#v", res)
	}
	var otherStatus string
	_ = pool.QueryRow(ctx, `SELECT status FROM payment_intents WHERE id=$1::uuid`, newIntent).Scan(&otherStatus)
	if otherStatus != domain.StatusExpired {
		t.Fatalf("unrelated intent mutated: %s", otherStatus)
	}
}

func TestReleasedExactIdempotentReplay(t *testing.T) {
	pool := setup(t)
	ctx := context.Background()
	contract := "0x55d398326f99059ff775485246999027b3197955"
	dest := uniqDest(33)
	mid := seedMerchantWallet(t, pool, "bsc", dest, contract)
	pay := uniqAmount(933)
	intentID, optionID := createIntentWithAmount(t, pool, mid, "bsc", dest, contract, pay-1, pay)
	expiresAt := releaseExpiredReservation(t, pool, intentID, optionID, 12*time.Minute)
	m := &payment.Matcher{Pool: pool, BSCConfirmations: 1, LateReconcileWindow: 2 * time.Hour}
	ev := bscEventAt(dest, contract, pay, 1, expiresAt.Add(time.Minute))
	if _, err := m.Ingest(ctx, ev); err != nil {
		t.Fatal(err)
	}
	res2, err := m.Ingest(ctx, ev)
	if err != nil {
		t.Fatal(err)
	}
	if !res2.Duplicate || !res2.Ignored {
		t.Fatalf("expected idempotent ignore got %#v", res2)
	}
	var n int
	_ = pool.QueryRow(ctx, `SELECT COUNT(*) FROM matched_transactions WHERE payment_intent_id=$1::uuid`, intentID).Scan(&n)
	if n != 1 {
		t.Fatalf("expected one match row, got %d", n)
	}
}

func TestReleasedExactOutsideWindowIgnored(t *testing.T) {
	pool := setup(t)
	ctx := context.Background()
	contract := "0x55d398326f99059ff775485246999027b3197955"
	dest := uniqDest(34)
	mid := seedMerchantWallet(t, pool, "bsc", dest, contract)
	pay := uniqAmount(934)
	intentID, optionID := createIntentWithAmount(t, pool, mid, "bsc", dest, contract, pay-1, pay)
	expiresAt := releaseExpiredReservation(t, pool, intentID, optionID, 3*time.Hour)
	m := &payment.Matcher{Pool: pool, BSCConfirmations: 1, LateReconcileWindow: 2 * time.Hour}
	res, err := m.Ingest(ctx, bscEventAt(dest, contract, pay, 1, expiresAt.Add(150*time.Minute)))
	if err != nil {
		t.Fatal(err)
	}
	if !res.Ignored || res.MatchType == "LATE_PAYMENT" {
		t.Fatalf("outside window must stay unmatched got %#v", res)
	}
	var status string
	var matches int
	_ = pool.QueryRow(ctx, `SELECT status FROM payment_intents WHERE id=$1::uuid`, intentID).Scan(&status)
	_ = pool.QueryRow(ctx, `SELECT COUNT(*) FROM matched_transactions WHERE payment_intent_id=$1::uuid`, intentID).Scan(&matches)
	if status != domain.StatusExpired || matches != 0 {
		t.Fatalf("status=%s matches=%d", status, matches)
	}
}

func TestAmbiguousReleasedExactNotAutoAssociated(t *testing.T) {
	pool := setup(t)
	ctx := context.Background()
	contract := "0x55d398326f99059ff775485246999027b3197955"
	dest := uniqDest(35)
	mid := seedMerchantWallet(t, pool, "bsc", dest, contract)
	pay := uniqAmount(935)
	intentA, optA := createIntentWithAmount(t, pool, mid, "bsc", dest, contract, pay-1, pay)
	// Second reservation with same amount requires releasing the unique hold first, then inserting another.
	expiresA := releaseExpiredReservation(t, pool, intentA, optA, 20*time.Minute)
	intentB, optB := createIntentWithAmount(t, pool, mid, "bsc", dest, contract, pay-1, pay)
	expiresB := releaseExpiredReservation(t, pool, intentB, optB, 9*time.Minute)
	_ = expiresA
	m := &payment.Matcher{Pool: pool, BSCConfirmations: 1, LateReconcileWindow: 2 * time.Hour}
	ev := bscEventAt(dest, contract, pay, 1, expiresB.Add(2*time.Minute))
	res, err := m.Ingest(ctx, ev)
	if err != nil {
		t.Fatal(err)
	}
	if res.MatchType != "AMBIGUOUS_LATE" || res.PaymentIntentID != "" {
		t.Fatalf("expected ambiguous unmatched got %#v", res)
	}
	var matches int
	_ = pool.QueryRow(ctx, `SELECT COUNT(*) FROM matched_transactions`).Scan(&matches)
	if matches != 0 {
		t.Fatalf("ambiguous must not insert matches, got %d", matches)
	}
	var statusA, statusB string
	_ = pool.QueryRow(ctx, `SELECT status FROM payment_intents WHERE id=$1::uuid`, intentA).Scan(&statusA)
	_ = pool.QueryRow(ctx, `SELECT status FROM payment_intents WHERE id=$1::uuid`, intentB).Scan(&statusB)
	if statusA != domain.StatusExpired || statusB != domain.StatusExpired {
		t.Fatalf("intents mutated A=%s B=%s", statusA, statusB)
	}
	var note string
	_ = pool.QueryRow(ctx, `
		SELECT raw_json->>'late_reconcile' FROM chain_events WHERE event_id=$1`, ev.EventID).Scan(&note)
	if note != "ambiguous_released_candidates" {
		t.Fatalf("expected observable ambiguity marker, got %q", note)
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

func TestReservationMatchedThenSettledViaConfirmations(t *testing.T) {
	pool := setup(t)
	ctx := context.Background()
	contract := "0x55d398326f99059ff775485246999027b3197955"
	dest := uniqDest(21)
	mid := seedMerchantWallet(t, pool, "bsc", dest, contract)
	pay := uniqAmount(900)
	intentID, optionID := createIntentWithAmount(t, pool, mid, "bsc", dest, contract, pay-1, pay)
	m := &payment.Matcher{Pool: pool, BSCConfirmations: 12}
	ev := bscEvent(dest, contract, pay, 0)
	res, err := m.Ingest(ctx, ev)
	if err != nil {
		t.Fatal(err)
	}
	if res.NewStatus != domain.StatusSeen {
		t.Fatalf("expected SEEN got %s", res.NewStatus)
	}
	var resStatus, optStatus string
	_ = pool.QueryRow(ctx, `SELECT status FROM amount_reservations WHERE payment_option_id=$1::uuid`, optionID).Scan(&resStatus)
	if resStatus != "matched" {
		t.Fatalf("expected matched reservation, got %s", resStatus)
	}
	if err := m.ApplyConfirmations(ctx, ev.EventID, 12); err != nil {
		t.Fatal(err)
	}
	var intentStatus string
	_ = pool.QueryRow(ctx, `SELECT status FROM payment_intents WHERE id=$1::uuid`, intentID).Scan(&intentStatus)
	_ = pool.QueryRow(ctx, `SELECT status FROM amount_reservations WHERE payment_option_id=$1::uuid`, optionID).Scan(&resStatus)
	_ = pool.QueryRow(ctx, `SELECT status FROM payment_options WHERE id=$1::uuid`, optionID).Scan(&optStatus)
	if intentStatus != domain.StatusPaid || resStatus != "consumed" || optStatus != "SETTLED" {
		t.Fatalf("settle incomplete intent=%s res=%s opt=%s", intentStatus, resStatus, optStatus)
	}
}

func TestSecondExactWhileMatchedNeedsReview(t *testing.T) {
	pool := setup(t)
	ctx := context.Background()
	contract := "0x55d398326f99059ff775485246999027b3197955"
	dest := uniqDest(22)
	mid := seedMerchantWallet(t, pool, "bsc", dest, contract)
	pay := uniqAmount(910)
	_, _ = createIntentWithAmount(t, pool, mid, "bsc", dest, contract, pay-1, pay)
	m := &payment.Matcher{Pool: pool, BSCConfirmations: 12}
	if _, err := m.Ingest(ctx, bscEvent(dest, contract, pay, 1)); err != nil {
		t.Fatal(err)
	}
	res, err := m.Ingest(ctx, bscEvent(dest, contract, pay, 1))
	if err != nil {
		t.Fatal(err)
	}
	if res.MatchType != "DUPLICATE_PAYMENT" || res.NewStatus != domain.StatusNeedsReview {
		t.Fatalf("expected DUPLICATE→NEEDS_REVIEW got %#v", res)
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

// OnTransition must observe committed payment state (side effects after TX), not mid-TX.
func TestOnTransitionRunsAfterCommit(t *testing.T) {
	pool := setup(t)
	ctx := context.Background()
	contract := "0x55d398326f99059ff775485246999027b3197955"
	dest := uniqDest(16)
	mid := seedMerchantWallet(t, pool, "bsc", dest, contract)
	pay := uniqAmount(881)
	intentID, _ := createIntentWithAmount(t, pool, mid, "bsc", dest, contract, pay-1, pay)

	var (
		mu           sync.Mutex
		calls        int
		statusInHook string
	)
	m := &payment.Matcher{
		Pool: pool, BSCConfirmations: 1, TronConfirmations: 1,
		OnTransition: func(merchantID, gotIntentID, eventType string, payload map[string]any) {
			var st string
			_ = pool.QueryRow(ctx, `SELECT status FROM payment_intents WHERE id=$1::uuid`, gotIntentID).Scan(&st)
			mu.Lock()
			calls++
			statusInHook = st
			mu.Unlock()
			if gotIntentID != intentID {
				t.Errorf("hook intent %s want %s", gotIntentID, intentID)
			}
			if merchantID != mid {
				t.Errorf("hook merchant %s want %s", merchantID, mid)
			}
			_ = eventType
			_ = payload
		},
	}
	res, err := m.Ingest(ctx, bscEvent(dest, contract, pay, 20))
	if err != nil {
		t.Fatal(err)
	}
	if res.NewStatus != domain.StatusPaid {
		t.Fatalf("want PAID got %#v", res)
	}
	mu.Lock()
	defer mu.Unlock()
	if calls < 1 {
		t.Fatal("expected OnTransition after successful match")
	}
	if statusInHook != domain.StatusPaid {
		t.Fatalf("OnTransition saw status %q; want committed PAID (side effects must run after TX)", statusInHook)
	}
}
