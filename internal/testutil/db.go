package testutil

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pooli-shop/pooli/internal/db"
)

// Connect opens the test database (DATABASE_URL or local docker-compose default).
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
	t.Cleanup(pool.Close)
	return pool
}

// Reset truncates application tables so tests do not depend on leftover local data.
// Keeps seed rows in subscription_plans.
func Reset(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_, err := pool.Exec(ctx, `
		TRUNCATE TABLE
			matched_transactions,
			payment_state_events,
			chain_events,
			amount_reservations,
			payment_options,
			payment_intents,
			exchange_rate_quotes,
			order_field_values,
			order_field_definitions,
			orders,
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
