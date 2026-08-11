package notify

import (
	"context"
	"log"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pooli-shop/pooli/internal/email"
)

const channelEmail = "email"

// Email delivers transactional messages via an EmailProvider.
// Failures never mutate payment state — call only after matcher commit.
type Email struct {
	Pool        *pgxpool.Pool
	Provider    email.Provider
	Enabled     bool
	FromName    string
	FromAddress string
	ReplyTo     string
	PublicBase  string
	MaxAttempts int
}

func (e *Email) maxAttempts() int {
	if e != nil && e.MaxAttempts > 0 {
		return e.MaxAttempts
	}
	return 3
}

func (e *Email) active() bool {
	return e != nil && e.Enabled && e.Provider != nil && e.Pool != nil
}

// DeliverPaidMerchant sends the merchant payment-received email once per intent.
func (e *Email) DeliverPaidMerchant(ctx context.Context, n PaidNotify) error {
	if !e.active() {
		return nil
	}
	var enabled bool
	var locale string
	if err := e.Pool.QueryRow(ctx, `
		SELECT notify_email_payment_received, preferred_locale
		FROM merchants WHERE id=$1::uuid`, n.MerchantID).Scan(&enabled, &locale); err != nil {
		return err
	}
	if !enabled {
		return nil
	}
	to, err := e.merchantOwnerEmail(ctx, n.MerchantID)
	if err != nil || to == "" {
		return nil
	}
	if n.Locale == "" {
		n.Locale = locale
	}
	eventKey := "payment.paid:" + n.IntentID + ":merchant"
	ok, err := beginDelivery(ctx, e.Pool, n.MerchantID, channelEmail, n.IntentID, "payment.paid", eventKey, map[string]any{
		"role": "merchant", "order_ref": n.OrderRef,
	})
	if err != nil || !ok {
		return err
	}

	merchantName, _ := e.merchantDisplayName(ctx, n.MerchantID)
	rendered := email.RenderPaid(email.PaidContent{
		Locale:       n.Locale,
		Role:         "merchant",
		MerchantName: merchantName,
		CustomerName: n.CustomerName,
		OrderRef:     n.OrderRef,
		OrderURL:     strings.TrimRight(e.PublicBase, "/") + "/app/orders/" + n.OrderID,
		Toman:        n.Toman,
		USDTBase:     n.USDTBase,
		Network:      n.Network,
	})
	return e.sendWithRetry(ctx, n.MerchantID, eventKey, to, rendered)
}

// DeliverPaidBuyer sends a buyer receipt when a valid buyer email exists.
func (e *Email) DeliverPaidBuyer(ctx context.Context, n PaidNotify, buyerEmail, orderSlug string) error {
	if !e.active() {
		return nil
	}
	to, err := email.SanitizeAddress(buyerEmail)
	if err != nil || to == "" {
		return nil
	}
	locale := n.Locale
	if locale == "" {
		_ = e.Pool.QueryRow(ctx, `SELECT preferred_locale FROM merchants WHERE id=$1::uuid`, n.MerchantID).Scan(&locale)
	}
	eventKey := "payment.paid:" + n.IntentID + ":buyer"
	ok, err := beginDelivery(ctx, e.Pool, n.MerchantID, channelEmail, n.IntentID, "payment.paid", eventKey, map[string]any{
		"role": "buyer", "order_ref": n.OrderRef,
	})
	if err != nil || !ok {
		return err
	}

	merchantName, _ := e.merchantDisplayName(ctx, n.MerchantID)
	viewURL := strings.TrimRight(e.PublicBase, "/") + "/p/" + orderSlug
	if orderSlug == "" && n.OrderID != "" {
		viewURL = strings.TrimRight(e.PublicBase, "/") + "/p/" + n.OrderRef
	}
	rendered := email.RenderPaid(email.PaidContent{
		Locale:       locale,
		Role:         "buyer",
		MerchantName: merchantName,
		CustomerName: n.CustomerName,
		OrderRef:     n.OrderRef,
		OrderURL:     viewURL,
		Toman:        n.Toman,
		USDTBase:     n.USDTBase,
		Network:      n.Network,
	})
	return e.sendWithRetry(ctx, n.MerchantID, eventKey, to, rendered)
}

// DeliverNeedsAttention emails the merchant about LATE/UNDER/OVER/NEEDS_REVIEW.
func (e *Email) DeliverNeedsAttention(ctx context.Context, n AttentionNotify) error {
	if !e.active() {
		return nil
	}
	var enabled bool
	var locale string
	if err := e.Pool.QueryRow(ctx, `
		SELECT notify_email_payment_attention, preferred_locale
		FROM merchants WHERE id=$1::uuid`, n.MerchantID).Scan(&enabled, &locale); err != nil {
		return err
	}
	if !enabled {
		return nil
	}
	to, err := e.merchantOwnerEmail(ctx, n.MerchantID)
	if err != nil || to == "" {
		return nil
	}
	if n.Locale == "" {
		n.Locale = locale
	}
	eventKey := "payment.needs_review:" + n.IntentID + ":merchant"
	ok, err := beginDelivery(ctx, e.Pool, n.MerchantID, channelEmail, n.IntentID, "payment.needs_review", eventKey, map[string]any{
		"status": n.Status, "order_ref": n.OrderRef,
	})
	if err != nil || !ok {
		return err
	}
	rendered := email.RenderAttention(email.AttentionContent{
		Locale:   n.Locale,
		OrderRef: n.OrderRef,
		OrderURL: strings.TrimRight(e.PublicBase, "/") + "/app/orders/" + n.OrderID,
		Status:   n.Status,
		Expected: n.Expected,
		Received: n.Received,
	})
	return e.sendWithRetry(ctx, n.MerchantID, eventKey, to, rendered)
}

// DeliverFulfillmentBuyer notifies the buyer when fulfillment status changes meaningfully.
func (e *Email) DeliverFulfillmentBuyer(ctx context.Context, merchantID, orderID, orderSlug, orderRef, status, shippingProvider, tracking, buyerEmail string) error {
	if !e.active() {
		return nil
	}
	to, err := email.SanitizeAddress(buyerEmail)
	if err != nil || to == "" {
		return nil
	}
	var enabled bool
	var locale string
	if err := e.Pool.QueryRow(ctx, `
		SELECT notify_email_order_updates, preferred_locale
		FROM merchants WHERE id=$1::uuid`, merchantID).Scan(&enabled, &locale); err != nil {
		return err
	}
	if !enabled {
		return nil
	}
	eventKey := "fulfillment." + strings.ToLower(status) + ":" + orderID + ":buyer"
	ok, err := beginDelivery(ctx, e.Pool, merchantID, channelEmail, "", "fulfillment."+strings.ToLower(status), eventKey, map[string]any{
		"order_ref": orderRef, "status": status,
	})
	if err != nil || !ok {
		return err
	}
	merchantName, _ := e.merchantDisplayName(ctx, merchantID)
	rendered := email.RenderFulfillment(email.FulfillmentContent{
		Locale:           locale,
		MerchantName:     merchantName,
		OrderRef:         orderRef,
		OrderURL:         strings.TrimRight(e.PublicBase, "/") + "/p/" + orderSlug,
		Status:           status,
		ShippingProvider: shippingProvider,
		TrackingNumber:   tracking,
	})
	return e.sendWithRetry(ctx, merchantID, eventKey, to, rendered)
}

func (e *Email) sendWithRetry(ctx context.Context, merchantID, eventKey, to string, rendered email.Rendered) error {
	providerName := e.Provider.Name()
	msg := email.Message{
		To:       to,
		Subject:  rendered.Subject,
		HTML:     rendered.HTML,
		Text:     rendered.Text,
		ReplyTo:  e.ReplyTo,
		EventKey: eventKey,
	}

	var lastErr error
	for i := 1; i <= e.maxAttempts(); i++ {
		res, err := e.Provider.Send(ctx, msg)
		if err == nil {
			markDelivered(ctx, e.Pool, merchantID, channelEmail, eventKey, providerName, res.ProviderMessageID, i)
			return nil
		}
		lastErr = err
		markFailed(ctx, e.Pool, merchantID, channelEmail, eventKey, i, err)
		if !email.IsRetryable(err) {
			break
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(time.Duration(i*i) * 200 * time.Millisecond):
		}
	}
	log.Printf("event=email_delivery_failed provider=%s event_key=%s category=%s err=%s",
		providerName, eventKey, email.CategoryOf(lastErr), redactSecrets(truncateErr(lastErr)))
	return lastErr
}

func (e *Email) merchantOwnerEmail(ctx context.Context, merchantID string) (string, error) {
	var addr string
	err := e.Pool.QueryRow(ctx, `
		SELECT u.email
		FROM merchant_users mu
		JOIN users u ON u.id = mu.user_id
		WHERE mu.merchant_id=$1::uuid AND mu.role='owner'
		  AND u.email IS NOT NULL AND btrim(u.email) <> ''
		ORDER BY mu.user_id
		LIMIT 1`, merchantID).Scan(&addr)
	if err != nil {
		return "", err
	}
	return email.SanitizeAddress(addr)
}

func (e *Email) merchantDisplayName(ctx context.Context, merchantID string) (string, error) {
	var name string
	err := e.Pool.QueryRow(ctx, `
		SELECT COALESCE(NULLIF(display_name,''), name) FROM merchants WHERE id=$1::uuid`, merchantID).Scan(&name)
	return name, err
}
