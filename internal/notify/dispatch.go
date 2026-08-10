package notify

import (
	"context"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pooli-shop/pooli/internal/domain"
)

// DispatchTransition sends merchant Telegram notifications for actionable payment events.
// Never changes payment state; safe to call from matcher OnTransition.
func DispatchTransition(ctx context.Context, pool *pgxpool.Pool, tg *Telegram, merchantID, intentID, eventType string, payload map[string]any) {
	if tg == nil || !tg.Enabled {
		return
	}
	switch eventType {
	case "payment.paid":
		var toman, usdt int64
		var orderRef, orderID, customerName string
		var network string
		_ = pool.QueryRow(ctx, `
			SELECT o.id::text, o.fiat_amount_toman, COALESCE(NULLIF(o.merchant_reference,''), o.slug),
			       COALESCE((SELECT pay_usdt_amount_base_units FROM payment_options WHERE payment_intent_id=$1::uuid AND status='SETTLED' LIMIT 1),0),
			       COALESCE((
			         SELECT value FROM order_field_values WHERE order_id=o.id AND field_key='full_name' LIMIT 1
			       ),'')
			FROM payment_intents pi JOIN orders o ON o.id=pi.order_id WHERE pi.id=$1::uuid`, intentID).
			Scan(&orderID, &toman, &orderRef, &usdt, &customerName)
		if payload != nil {
			if v, ok := payload["network"].(string); ok {
				network = v
			}
			if v, ok := payload["amount_base_units"].(int64); ok && v > 0 {
				usdt = v
			}
			if v, ok := payload["amount_base_units"].(float64); ok && v > 0 {
				usdt = int64(v)
			}
		}
		_ = tg.DeliverPaid(ctx, PaidNotify{
			MerchantID:   merchantID,
			IntentID:     intentID,
			OrderID:      orderID,
			OrderRef:     orderRef,
			CustomerName: customerName,
			Toman:        toman,
			USDTBase:     usdt,
			Network:      network,
		})
	case "payment.needs_review":
		var orderRef, orderID, status string
		var expectedBase, receivedBase int64
		_ = pool.QueryRow(ctx, `
			SELECT o.id::text, COALESCE(NULLIF(o.merchant_reference,''), o.slug), pi.status,
			       COALESCE((SELECT pay_usdt_amount_base_units FROM payment_options po
			                 WHERE po.payment_intent_id=pi.id ORDER BY po.created_at DESC LIMIT 1),0)
			FROM payment_intents pi JOIN orders o ON o.id=pi.order_id WHERE pi.id=$1::uuid`, intentID).
			Scan(&orderID, &orderRef, &status, &expectedBase)
		if payload != nil {
			if v, ok := payload["match_type"].(string); ok && v != "" {
				status = v
			}
			if v, ok := payload["amount_base_units"].(int64); ok {
				receivedBase = v
			}
			if v, ok := payload["amount_base_units"].(float64); ok {
				receivedBase = int64(v)
			}
		}
		expected := domain.FormatUSDTBaseUnits(expectedBase)
		received := ""
		if receivedBase > 0 {
			received = domain.FormatUSDTBaseUnits(receivedBase)
		}
		_ = tg.DeliverNeedsAttention(ctx, AttentionNotify{
			MerchantID: merchantID,
			IntentID:   intentID,
			OrderID:    orderID,
			OrderRef:   orderRef,
			Status:     strings.ToUpper(status),
			Expected:   expected,
			Received:   received,
		})
	}
}
