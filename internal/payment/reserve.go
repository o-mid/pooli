package payment

import (
	"context"
	"errors"
	"fmt"
	"math/rand"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pooli-shop/pooli/internal/domain"
	"github.com/shopspring/decimal"
)

var ErrReservationConflict = errors.New("amount reservation conflict")

// ReserveUniqueAmount finds an unused pay amount near baseAmount for the destination.
// Existence checks alone are not race-safe; prefer ClaimUniqueReservation in writers.
func ReserveUniqueAmount(ctx context.Context, tx pgx.Tx, destinationNorm, network, token string, baseAmount int64, maxAttempts int) (int64, error) {
	if maxAttempts <= 0 {
		maxAttempts = 32
	}
	for i := 0; i < maxAttempts; i++ {
		candidate := baseAmount + int64(i+1)
		if i > 16 {
			candidate = baseAmount + int64(rand.Intn(900000)+100000)
		}
		var exists bool
		err := tx.QueryRow(ctx, `
			SELECT EXISTS(
				SELECT 1 FROM amount_reservations
				WHERE destination_address_normalized = $1
				  AND network = $2
				  AND token_contract = $3
				  AND pay_amount_base_units = $4
				  AND status = 'active'
			)`, destinationNorm, network, token, candidate).Scan(&exists)
		if err != nil {
			return 0, err
		}
		if !exists {
			return candidate, nil
		}
	}
	return 0, ErrReservationConflict
}

// ClaimUniqueReservation inserts an active reservation, retrying on unique conflicts.
func ClaimUniqueReservation(ctx context.Context, tx pgx.Tx, optionID, destinationNorm, network, token string, baseAmount int64, expiresAt time.Time, maxAttempts int) (int64, error) {
	if maxAttempts <= 0 {
		maxAttempts = 48
	}
	for i := 0; i < maxAttempts; i++ {
		candidate := baseAmount + int64(i+1)
		if i > 16 {
			candidate = baseAmount + int64(rand.Intn(900000)+100000)
		}
		tag, err := tx.Exec(ctx, `
			INSERT INTO amount_reservations (
				payment_option_id, destination_address_normalized, network, token_contract,
				pay_amount_base_units, status, expires_at
			) VALUES ($1::uuid, $2, $3, $4, $5, 'active', $6)
			ON CONFLICT (destination_address_normalized, network, token_contract, pay_amount_base_units)
				WHERE status = 'active'
			DO NOTHING`,
			optionID, destinationNorm, network, token, candidate, expiresAt)
		if err != nil {
			if isUniqueViolation(err) {
				continue
			}
			return 0, err
		}
		if tag.RowsAffected() == 1 {
			_, err = tx.Exec(ctx, `
				UPDATE payment_options SET pay_usdt_amount_base_units=$2 WHERE id=$1::uuid`, optionID, candidate)
			if err != nil {
				return 0, err
			}
			return candidate, nil
		}
	}
	return 0, ErrReservationConflict
}

func InsertReservation(ctx context.Context, tx pgx.Tx, optionID, destinationNorm, network, token string, amount int64, expiresAt interface{}) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO amount_reservations (
			payment_option_id, destination_address_normalized, network, token_contract,
			pay_amount_base_units, status, expires_at
		) VALUES ($1::uuid, $2, $3, $4, $5, 'active', $6)`,
		optionID, destinationNorm, network, token, amount, expiresAt)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrReservationConflict, err)
	}
	return nil
}

func ComputeBaseUSDT(toman int64, rate decimal.Decimal) (int64, error) {
	usdt, err := domain.TomanToUSDT(toman, rate)
	if err != nil {
		return 0, err
	}
	base := domain.USDTToBaseUnits(usdt)
	if base <= 0 {
		return 0, fmt.Errorf("computed USDT amount too small")
	}
	return base, nil
}

func WithTx(ctx context.Context, pool *pgxpool.Pool, fn func(pgx.Tx) error) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == "23505"
	}
	return strings.Contains(err.Error(), "amount_reservations_active_uniq") || strings.Contains(err.Error(), "23505")
}
