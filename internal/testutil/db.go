package testutil

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pooli-shop/pooli/internal/db"
)

// Shared advisory lock key so packages that hit the same local Postgres
// (httpapi + payment) do not TRUNCATE each other mid-test.
const testDBLockKey int64 = 872314001

// Connect opens the test database (DATABASE_URL or local docker-compose default).
// It also acquires a Postgres session advisory lock for the lifetime of the test
// so parallel packages sharing one DB do not race on TRUNCATE.
func Connect(t *testing.T) *pgxpool.Pool {
	t.Helper()
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		url = "postgres://pooli:pooli@localhost:5432/pooli?sslmode=disable"
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	pool, err := db.Connect(ctx, url)
	if err != nil {
		t.Skipf("database unavailable: %v", err)
	}

	lockCtx, lockCancel := context.WithTimeout(context.Background(), 2*time.Minute)
	conn, err := pool.Acquire(lockCtx)
	if err != nil {
		lockCancel()
		pool.Close()
		t.Fatalf("acquire lock connection: %v", err)
	}
	if _, err := conn.Exec(lockCtx, `SELECT pg_advisory_lock($1)`, testDBLockKey); err != nil {
		conn.Release()
		lockCancel()
		pool.Close()
		t.Fatalf("pg_advisory_lock: %v", err)
	}

	t.Cleanup(func() {
		_, _ = conn.Exec(context.Background(), `SELECT pg_advisory_unlock($1)`, testDBLockKey)
		conn.Release()
		lockCancel()
		pool.Close()
	})
	return pool
}

// Reset truncates application tables so tests do not depend on leftover local data.
// Keeps seed rows in subscription_plans.
func Reset(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	_, err := pool.Exec(ctx, `
		TRUNCATE TABLE
			matched_transactions,
			payment_state_events,
			order_timeline_events,
			chain_events,
			amount_reservations,
			payment_options,
			payment_intents,
			exchange_rate_quotes,
			order_field_values,
			order_field_definitions,
			customer_addresses,
			customers,
			orders,
			merchant_checkout_defaults,
			merchant_wallet_addresses,
			telegram_connections,
			notification_deliveries,
			webhook_deliveries,
			webhook_endpoints,
			usage_counters,
			subscriptions,
			audit_events,
			sessions,
			merchant_users,
			merchants,
			users,
			watcher_cursors
		RESTART IDENTITY CASCADE`)
	if err != nil {
		t.Fatalf("reset database: %v", err)
	}
}
