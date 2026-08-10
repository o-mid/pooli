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

// DispatchTransition sends merchant Telegram notifications for actionable payment events.
// Never changes payment state. Call only after the matcher transaction has committed.
func DispatchTransition(ctx context.Context, pool *pgxpool.Pool, tg *Telegram, merchantID, intentID, eventType string, payload map[string]any) {
	if tg == nil || !tg.Enabled || intentID == "" {
		return
	}
	switch eventType {
	case "payment.paid":
		var toman, usdt int64
		var orderRef, orderID, customerName string
		err := pool.QueryRow(ctx, `
			SELECT o.id::text, o.fiat_amount_toman, COALESCE(NULLIF(o.merchant_reference,''), o.slug),
			       COALESCE((
			         SELECT pay_usdt_amount_base_units FROM payment_options
			         WHERE payment_intent_id=$1::uuid AND status='SETTLED'
			         ORDER BY created_at DESC LIMIT 1
			       ),0),
			       COALESCE((
			         SELECT value FROM order_field_values WHERE order_id=o.id AND field_key='full_name' LIMIT 1
			       ),'')
			FROM payment_intents pi JOIN orders o ON o.id=pi.order_id WHERE pi.id=$1::uuid`, intentID).
			Scan(&orderID, &toman, &orderRef, &usdt, &customerName)
		if err != nil {
			log.Printf("event=telegram_dispatch_skip reason=paid_lookup err=%v intent=%s", err, intentID)
			return
		}
		if v, ok := payloadInt64(payload, "amount_base_units"); ok && v > 0 {
			usdt = v
		}
		if usdt <= 0 {
			_ = pool.QueryRow(ctx, `
				SELECT COALESCE(pay_usdt_amount_base_units,0) FROM payment_options
				WHERE payment_intent_id=$1::uuid ORDER BY created_at DESC LIMIT 1`, intentID).Scan(&usdt)
		}
		network := payloadString(payload, "network")
		if err := tg.DeliverPaid(ctx, PaidNotify{
			MerchantID:   merchantID,
			IntentID:     intentID,
			OrderID:      orderID,
			OrderRef:     orderRef,
			CustomerName: customerName,
			Toman:        toman,
			USDTBase:     usdt,
			Network:      network,
		}); err != nil {
			log.Printf("event=telegram_dispatch_error kind=paid err=%v intent=%s", err, intentID)
		}
	case "payment.needs_review":
		var orderRef, orderID, status string
		var expectedBase int64
		err := pool.QueryRow(ctx, `
			SELECT o.id::text, COALESCE(NULLIF(o.merchant_reference,''), o.slug), pi.status,
			       COALESCE((SELECT pay_usdt_amount_base_units FROM payment_options po
			                 WHERE po.payment_intent_id=pi.id ORDER BY po.created_at DESC LIMIT 1),0)
			FROM payment_intents pi JOIN orders o ON o.id=pi.order_id WHERE pi.id=$1::uuid`, intentID).
			Scan(&orderID, &orderRef, &status, &expectedBase)
		if err != nil {
			log.Printf("event=telegram_dispatch_skip reason=review_lookup err=%v intent=%s", err, intentID)
			return
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
		if err := tg.DeliverNeedsAttention(ctx, AttentionNotify{
			MerchantID: merchantID,
			IntentID:   intentID,
			OrderID:    orderID,
			OrderRef:   orderRef,
			Status:     strings.ToUpper(status),
			Expected:   expected,
			Received:   received,
		}); err != nil {
			log.Printf("event=telegram_dispatch_error kind=attention err=%v intent=%s", err, intentID)
		}
	}
}
