package payment

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

// RecordPaymentTimeline writes a payment.* timeline event for the order linked to intentID.
func RecordPaymentTimeline(ctx context.Context, pool *pgxpool.Pool, merchantID, intentID, eventType string, payload map[string]any) {
	if pool == nil || intentID == "" {
		return
	}
	var orderID string
	if err := pool.QueryRow(ctx, `SELECT order_id::text FROM payment_intents WHERE id=$1::uuid`, intentID).Scan(&orderID); err != nil {
		return
	}
	title := strings.TrimPrefix(eventType, "payment.")
	if title == eventType {
		title = eventType
	}
	title = strings.ToUpper(strings.ReplaceAll(title, ".", "_"))
	switch eventType {
	case "payment.seen":
		title = "Payment detected"
	case "payment.confirming":
		title = "Payment confirming"
	case "payment.paid":
		title = "Payment confirmed"
	case "payment.expired":
		title = "Payment expired"
	case "payment.underpaid":
		title = "Underpaid"
	case "payment.overpaid":
		title = "Overpaid"
	case "payment.needs_review":
		title = "Needs review"
	}
	meta := payload
	if meta == nil {
		meta = map[string]any{}
	}
	b, _ := json.Marshal(meta)
	_, _ = pool.Exec(ctx, `
		INSERT INTO order_timeline_events (order_id, merchant_id, event_type, source, title, detail, metadata_json, actor)
		VALUES ($1::uuid,$2::uuid,$3,'payment',$4,'',$5::jsonb,'system')`,
		orderID, merchantID, eventType, title, string(b))

	if eventType == "payment.paid" {
		BumpCustomerLifetimePaid(ctx, pool, orderID)
	}
}

// BumpCustomerLifetimePaid increments merchant-scoped lifetime paid for the order's customer.
func BumpCustomerLifetimePaid(ctx context.Context, pool *pgxpool.Pool, orderID string) {
	var customerID *string
	var toman int64
	var merchantID string
	err := pool.QueryRow(ctx, `
		SELECT customer_id::text, fiat_amount_toman, merchant_id::text
		FROM orders WHERE id=$1::uuid`, orderID).Scan(&customerID, &toman, &merchantID)
	if err != nil || customerID == nil || *customerID == "" {
		return
	}
	_, _ = pool.Exec(ctx, `
		UPDATE customers SET
			lifetime_paid_toman = lifetime_paid_toman + $2,
			last_order_at = now(),
			updated_at = now()
		WHERE id=$1::uuid AND merchant_id=$3::uuid`, *customerID, toman, merchantID)
}
