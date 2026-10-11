package agent

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pooli-shop/pooli/internal/domain"
)

// OrderSnapshot is the grounded payment narrative for agent tools.
type OrderSnapshot struct {
	SchemaVersion        string           `json:"schema_version"`
	OrderID              string           `json:"order_id"`
	MerchantID           string           `json:"merchant_id"`
	Slug                 string           `json:"slug"`
	Title                string           `json:"title"`
	Status               string           `json:"status"`
	FiatCurrency         string           `json:"fiat_currency"`
	AmountUsdtBaseUnits  int64            `json:"amount_usdt_base_units"`
	CheckoutURL          string           `json:"checkout_url"`
	Payment              *PaymentSnapshot `json:"payment,omitempty"`
	TimelineSummary      []TimelineItem   `json:"timeline_summary"`
}

type PaymentSnapshot struct {
	IntentID string `json:"intent_id"`
	Status   string `json:"status"`
	ExpiresAt *time.Time `json:"expires_at,omitempty"`
	PaidAt    *time.Time `json:"paid_at,omitempty"`
}

type TimelineItem struct {
	EventType string    `json:"event_type"`
	Title     string    `json:"title"`
	Detail    string    `json:"detail,omitempty"`
	At        time.Time `json:"at"`
}

// BuildOrderSnapshotByOrderID resolves the merchant from the order row (gateway service calls).
func BuildOrderSnapshotByOrderID(ctx context.Context, pool *pgxpool.Pool, orderID, publicBaseURL string) (OrderSnapshot, error) {
	var merchantID string
	if err := pool.QueryRow(ctx, `SELECT merchant_id::text FROM orders WHERE id=$1::uuid`, orderID).Scan(&merchantID); err != nil {
		return OrderSnapshot{}, err
	}
	return BuildOrderSnapshot(ctx, pool, merchantID, orderID, publicBaseURL)
}

// BuildOrderSnapshot loads merchant-scoped order state and applies agent policy.
func BuildOrderSnapshot(ctx context.Context, pool *pgxpool.Pool, merchantID, orderID, publicBaseURL string) (OrderSnapshot, error) {
	var snap OrderSnapshot
	var usdtBase int64
	var fiatCur, slug, title, status string
	var legacyToman *int64
	err := pool.QueryRow(ctx, `
		SELECT id::text, merchant_id::text, slug, title, status,
		       COALESCE(amount_usdt_base_units, 0), fiat_amount_toman, COALESCE(NULLIF(fiat_currency,''), 'TMN')
		FROM orders WHERE id=$1::uuid AND merchant_id=$2::uuid`,
		orderID, merchantID).Scan(
		&snap.OrderID, &snap.MerchantID, &slug, &title, &status,
		&usdtBase, &legacyToman, &fiatCur,
	)
	if err != nil {
		return snap, err
	}
	_ = legacyToman
	snap.SchemaVersion = SnapshotSchemaVersion
	snap.Slug = slug
	snap.Title = title
	snap.Status = status
	snap.FiatCurrency = fiatCur
	snap.AmountUsdtBaseUnits = usdtBase
	base := strings.TrimRight(publicBaseURL, "/")
	snap.CheckoutURL = fmt.Sprintf("%s/p/%s", base, slug)

	var intentID, payStatus string
	var expiresAt, paidAt *time.Time
	err = pool.QueryRow(ctx, `
		SELECT id::text, status, expires_at, paid_at
		FROM payment_intents WHERE order_id=$1::uuid AND merchant_id=$2::uuid`,
		orderID, merchantID).Scan(&intentID, &payStatus, &expiresAt, &paidAt)
	if err == nil && intentID != "" {
		if payStatus == "" {
			payStatus = status
		}
		snap.Payment = &PaymentSnapshot{
			IntentID:  intentID,
			Status:    payStatus,
			ExpiresAt: expiresAt,
			PaidAt:    paidAt,
		}
		if snap.Payment.Status == domain.StatusPaid || snap.Payment.Status == domain.StatusLatePayment {
			snap.Status = snap.Payment.Status
		}
	}

	rows, err := pool.Query(ctx, `
		SELECT event_type, title, detail, created_at
		FROM order_timeline_events
		WHERE order_id=$1::uuid AND merchant_id=$2::uuid
		ORDER BY created_at ASC, id ASC
		LIMIT 20`, orderID, merchantID)
	if err != nil {
		return snap, err
	}
	defer rows.Close()
	for rows.Next() {
		var etype, ttitle, detail string
		var at time.Time
		if err := rows.Scan(&etype, &ttitle, &detail, &at); err != nil {
			return snap, err
		}
		if !AllowedTimelineEventTypes[etype] {
			continue
		}
		snap.TimelineSummary = append(snap.TimelineSummary, TimelineItem{
			EventType: etype,
			Title:     ttitle,
			Detail:    detail,
			At:        at,
		})
	}
	if snap.TimelineSummary == nil {
		snap.TimelineSummary = []TimelineItem{}
	}
	return snap, nil
}
