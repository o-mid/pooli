package notify

import (
	"context"
	"log"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pooli-shop/pooli/internal/domain"
)

func payloadInt64(payload map[string]any, key string) (int64, bool) {
	if payload == nil {
		return 0, false
	}
	switch v := payload[key].(type) {
	case int64:
		return v, true
	case int:
		return int64(v), true
	case float64:
		return int64(v), true
	default:
		return 0, false
	}
}

func payloadString(payload map[string]any, key string) string {
	if payload == nil {
		return ""
	}
	if v, ok := payload[key].(string); ok {
		return v
	}
	return ""
}

// Channels fans out domain notification events to delivery providers.
type Channels struct {
	Telegram *Telegram
	Email    *Email
}

// DispatchTransition sends merchant/buyer notifications for actionable payment events.
// Never changes payment state. Call only after the matcher transaction has committed.
func DispatchTransition(ctx context.Context, pool *pgxpool.Pool, ch Channels, merchantID, intentID, eventType string, payload map[string]any) {
	tgOn := ch.Telegram != nil && ch.Telegram.Enabled
	mailOn := ch.Email != nil && ch.Email.Enabled && ch.Email.Provider != nil
	if (!tgOn && !mailOn) || intentID == "" {
		return
	}

	switch eventType {
	case "payment.paid":
		paid, buyerEmail, orderSlug, ok := loadPaidContext(ctx, pool, intentID, payload)
		if !ok {
			return
		}
		paid.MerchantID = merchantID
		paid.IntentID = intentID
		if tgOn {
			if err := ch.Telegram.DeliverPaid(ctx, paid); err != nil {
				log.Printf("event=telegram_dispatch_error kind=paid err=%v intent=%s", err, intentID)
			}
		}
		if mailOn {
			if err := ch.Email.DeliverPaidMerchant(ctx, paid); err != nil {
				log.Printf("event=email_dispatch_error kind=paid_merchant err=%v intent=%s", err, intentID)
			}
			if buyerEmail != "" {
				if err := ch.Email.DeliverPaidBuyer(ctx, paid, buyerEmail, orderSlug); err != nil {
					log.Printf("event=email_dispatch_error kind=paid_buyer err=%v intent=%s", err, intentID)
				}
			}
		}
	case "payment.needs_review":
		attn, ok := loadAttentionContext(ctx, pool, intentID, payload)
		if !ok {
			return
		}
		attn.MerchantID = merchantID
		attn.IntentID = intentID
		if tgOn {
			if err := ch.Telegram.DeliverNeedsAttention(ctx, attn); err != nil {
				log.Printf("event=telegram_dispatch_error kind=attention err=%v intent=%s", err, intentID)
			}
		}
		if mailOn {
			if err := ch.Email.DeliverNeedsAttention(ctx, attn); err != nil {
				log.Printf("event=email_dispatch_error kind=attention err=%v intent=%s", err, intentID)
			}
		}
	}
}

func loadPaidContext(ctx context.Context, pool *pgxpool.Pool, intentID string, payload map[string]any) (PaidNotify, string, string, bool) {
	var toman, usdt int64
	var orderRef, orderID, customerName, orderSlug, buyerEmail, customerEmail string
	err := pool.QueryRow(ctx, `
		SELECT o.id::text, o.slug, o.fiat_amount_toman, COALESCE(NULLIF(o.merchant_reference,''), o.slug),
		       COALESCE((
		         SELECT pay_usdt_amount_base_units FROM payment_options
		         WHERE payment_intent_id=$1::uuid AND status='SETTLED'
		         ORDER BY created_at DESC LIMIT 1
		       ),0),
		       COALESCE((
		         SELECT value FROM order_field_values WHERE order_id=o.id AND field_key='full_name' LIMIT 1
		       ),''),
		       COALESCE((
		         SELECT value FROM order_field_values WHERE order_id=o.id AND field_key='email' LIMIT 1
		       ),''),
		       COALESCE(c.email,'')
		FROM payment_intents pi
		JOIN orders o ON o.id=pi.order_id
		LEFT JOIN customers c ON c.id=o.customer_id
		WHERE pi.id=$1::uuid`, intentID).
		Scan(&orderID, &orderSlug, &toman, &orderRef, &usdt, &customerName, &buyerEmail, &customerEmail)
	if err != nil {
		log.Printf("event=notify_dispatch_skip reason=paid_lookup err=%v intent=%s", err, intentID)
		return PaidNotify{}, "", "", false
	}
	if v, ok := payloadInt64(payload, "amount_base_units"); ok && v > 0 {
		usdt = v
	}
	if usdt <= 0 {
		_ = pool.QueryRow(ctx, `
			SELECT COALESCE(pay_usdt_amount_base_units,0) FROM payment_options
			WHERE payment_intent_id=$1::uuid ORDER BY created_at DESC LIMIT 1`, intentID).Scan(&usdt)
	}
	if strings.TrimSpace(buyerEmail) == "" {
		buyerEmail = customerEmail
	}
	return PaidNotify{
		OrderID:      orderID,
		OrderRef:     orderRef,
		CustomerName: customerName,
		Toman:        toman,
		USDTBase:     usdt,
		Network:      payloadString(payload, "network"),
	}, buyerEmail, orderSlug, true
}

func loadAttentionContext(ctx context.Context, pool *pgxpool.Pool, intentID string, payload map[string]any) (AttentionNotify, bool) {
	var orderRef, orderID, status string
	var expectedBase int64
	err := pool.QueryRow(ctx, `
		SELECT o.id::text, COALESCE(NULLIF(o.merchant_reference,''), o.slug), pi.status,
		       COALESCE((SELECT pay_usdt_amount_base_units FROM payment_options po
		                 WHERE po.payment_intent_id=pi.id ORDER BY po.created_at DESC LIMIT 1),0)
		FROM payment_intents pi JOIN orders o ON o.id=pi.order_id WHERE pi.id=$1::uuid`, intentID).
		Scan(&orderID, &orderRef, &status, &expectedBase)
	if err != nil {
		log.Printf("event=notify_dispatch_skip reason=review_lookup err=%v intent=%s", err, intentID)
		return AttentionNotify{}, false
	}
	if v := payloadString(payload, "match_type"); v != "" {
		status = v
	} else if v := payloadString(payload, "status"); v != "" {
		status = v
	}
	var receivedBase int64
	if v, ok := payloadInt64(payload, "amount_base_units"); ok {
		receivedBase = v
	}
	expected := domain.FormatUSDTBaseUnits(expectedBase)
	received := ""
	if receivedBase > 0 {
		received = domain.FormatUSDTBaseUnits(receivedBase)
	}
	return AttentionNotify{
		OrderID:  orderID,
		OrderRef: orderRef,
		Status:   strings.ToUpper(status),
		Expected: expected,
		Received: received,
	}, true
}
