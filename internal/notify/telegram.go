package notify

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pooli-shop/pooli/internal/domain"
)

type Telegram struct {
	Pool        *pgxpool.Pool
	Token       string
	Enabled     bool
	BotUsername string
	PublicBase  string // e.g. https://pooli.shop
	HTTP        *http.Client
	APIBase     string // override for tests: fake server URL without /botTOKEN
	MaxAttempts int
}

type PaidNotify struct {
	MerchantID   string
	IntentID     string
	OrderID      string
	OrderRef     string
	CustomerName string
	Toman        int64
	USDTBase     int64
	Network      string
	Locale       string // en|fa
}

type AttentionNotify struct {
	MerchantID string
	IntentID   string
	OrderID    string
	OrderRef   string
	Status     string
	Expected   string
	Received   string
	Locale     string
}

func (t *Telegram) client() *http.Client {
	if t.HTTP != nil {
		return t.HTTP
	}
	return &http.Client{Timeout: 8 * time.Second}
}

func (t *Telegram) apiURL(method string) string {
	if t.APIBase != "" {
		return strings.TrimRight(t.APIBase, "/") + "/" + method
	}
	return "https://api.telegram.org/bot" + t.Token + "/" + method
}

func (t *Telegram) maxAttempts() int {
	if t.MaxAttempts > 0 {
		return t.MaxAttempts
	}
	return 3
}

// DeliverPaid sends a commerce-first PAID notification exactly once per intent.
func (t *Telegram) DeliverPaid(ctx context.Context, n PaidNotify) error {
	if !t.Enabled || t.Token == "" {
		return nil
	}
	eventKey := "payment.paid:" + n.IntentID
	ok, err := t.beginDelivery(ctx, n.MerchantID, n.IntentID, "payment.paid", eventKey, map[string]any{
		"order_ref": n.OrderRef, "toman": n.Toman,
	})
	if err != nil || !ok {
		return err
	}

	chatID, err := t.chatID(ctx, n.MerchantID)
	if err != nil || chatID == "" {
		_ = t.failDelivery(ctx, n.MerchantID, eventKey, "no telegram connection")
		return nil
	}
	var notifyPaid bool
	_ = t.Pool.QueryRow(ctx, `SELECT notify_payment_received FROM merchants WHERE id=$1::uuid`, n.MerchantID).Scan(&notifyPaid)
	if !notifyPaid {
		_ = t.failDelivery(ctx, n.MerchantID, eventKey, "pref disabled")
		return nil
	}

	name := strings.TrimSpace(n.CustomerName)
	text := t.paidText(n.Locale, name, n.OrderRef, n.Toman, n.USDTBase, n.Network)
	orderURL := strings.TrimRight(t.PublicBase, "/") + "/app/orders/" + n.OrderID
	if n.OrderID != "" {
		text += "\n" + orderURL
	}
	return t.sendWithRetry(ctx, n.MerchantID, eventKey, chatID, text)
}

// DeliverNeedsAttention notifies once for LATE/UNDER/OVER/NEEDS_REVIEW style events.
func (t *Telegram) DeliverNeedsAttention(ctx context.Context, n AttentionNotify) error {
	if !t.Enabled || t.Token == "" {
		return nil
	}
	eventKey := "payment.needs_review:" + n.IntentID
	ok, err := t.beginDelivery(ctx, n.MerchantID, n.IntentID, "payment.needs_review", eventKey, map[string]any{
		"status": n.Status, "order_ref": n.OrderRef,
	})
	if err != nil || !ok {
		return err
	}
	chatID, err := t.chatID(ctx, n.MerchantID)
	if err != nil || chatID == "" {
		_ = t.failDelivery(ctx, n.MerchantID, eventKey, "no telegram connection")
		return nil
	}
	var notifyAttn bool
	_ = t.Pool.QueryRow(ctx, `SELECT notify_payment_attention FROM merchants WHERE id=$1::uuid`, n.MerchantID).Scan(&notifyAttn)
	if !notifyAttn {
		_ = t.failDelivery(ctx, n.MerchantID, eventKey, "pref disabled")
		return nil
	}
	text := t.attentionText(n.Locale, n.OrderRef, n.Expected, n.Received)
	if n.OrderID != "" {
		text += "\n" + strings.TrimRight(t.PublicBase, "/") + "/app/orders/" + n.OrderID
	}
	return t.sendWithRetry(ctx, n.MerchantID, eventKey, chatID, text)
}

// SendRaw posts an arbitrary message to a chat (used after /start connect).
func (t *Telegram) SendRaw(ctx context.Context, chatID, text string) error {
	if !t.Enabled || t.Token == "" || chatID == "" {
		return nil
	}
	return t.postMessage(ctx, chatID, text)
}

// SendTest sends a one-off test message (not idempotent across calls; rate-limit at HTTP layer).
func (t *Telegram) SendTest(ctx context.Context, merchantID, locale string) error {
	if !t.Enabled || t.Token == "" {
		return errors.New("telegram disabled")
	}
	chatID, err := t.chatID(ctx, merchantID)
	if err != nil || chatID == "" {
		return errors.New("telegram not connected")
	}
	text := "Pooli test ✓\nTelegram notifications are working."
	if locale == "fa" {
		text = "تست پولیی ✓\nاعلان‌های تلگرام فعال است."
	}
	return t.postMessage(ctx, chatID, text)
}

// NotifyPaid keeps a thin compatibility wrapper used by older call sites.
func (t *Telegram) NotifyPaid(ctx context.Context, merchantID, orderRef string, toman int64, usdtBase int64, network, txHash string) error {
	return t.DeliverPaid(ctx, PaidNotify{
		MerchantID: merchantID,
		IntentID:   "legacy:" + orderRef + ":" + txHash,
		OrderRef:   orderRef,
		Toman:      toman,
		USDTBase:   usdtBase,
		Network:    network,
	})
}

func (t *Telegram) chatID(ctx context.Context, merchantID string) (string, error) {
	var chatID string
	err := t.Pool.QueryRow(ctx, `
		SELECT chat_id FROM telegram_connections WHERE merchant_id=$1::uuid AND enabled=true`, merchantID).Scan(&chatID)
	if err != nil {
		return "", err
	}
	return chatID, nil
}

func (t *Telegram) beginDelivery(ctx context.Context, merchantID, intentID, eventType, eventKey string, payload map[string]any) (bool, error) {
	b, _ := json.Marshal(payload)
	tag, err := t.Pool.Exec(ctx, `
		INSERT INTO notification_deliveries (
			merchant_id, channel, event_type, event_key, payment_intent_id, payload_json, status, attempts
		) VALUES (
			$1::uuid, 'telegram', $2, $3,
			NULLIF($4,'')::uuid, $5::jsonb, 'pending', 0
		)
		ON CONFLICT (merchant_id, channel, event_key) WHERE event_key IS NOT NULL
		DO NOTHING`, merchantID, eventType, eventKey, intentID, string(b))
	if err != nil {
		// payment_intent_id may be non-uuid for legacy — retry without it
		if isInvalidUUID(err) {
			tag, err = t.Pool.Exec(ctx, `
				INSERT INTO notification_deliveries (
					merchant_id, channel, event_type, event_key, payload_json, status, attempts
				) VALUES ($1::uuid,'telegram',$2,$3,$4::jsonb,'pending',0)
				ON CONFLICT (merchant_id, channel, event_key) WHERE event_key IS NOT NULL
				DO NOTHING`, merchantID, eventType, eventKey, string(b))
		}
		if err != nil {
			return false, err
		}
	}
	return tag.RowsAffected() == 1, nil
}

func (t *Telegram) sendWithRetry(ctx context.Context, merchantID, eventKey, chatID, text string) error {
	var lastErr error
	for i := 1; i <= t.maxAttempts(); i++ {
		lastErr = t.postMessage(ctx, chatID, text)
		if lastErr == nil {
			_, _ = t.Pool.Exec(ctx, `
				UPDATE notification_deliveries
				SET status='delivered', attempts=$3, delivered_at=now(), last_error=''
				WHERE merchant_id=$1::uuid AND channel='telegram' AND event_key=$2`,
				merchantID, eventKey, i)
			return nil
		}
		_, _ = t.Pool.Exec(ctx, `
			UPDATE notification_deliveries
			SET status='failed', attempts=$3, last_error=$4
			WHERE merchant_id=$1::uuid AND channel='telegram' AND event_key=$2`,
			merchantID, eventKey, i, truncateErr(lastErr))
		if !isRetryable(lastErr) {
			break
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(time.Duration(i*i) * 200 * time.Millisecond):
		}
	}
	return lastErr
}

func (t *Telegram) failDelivery(ctx context.Context, merchantID, eventKey, reason string) error {
	_, err := t.Pool.Exec(ctx, `
		UPDATE notification_deliveries
		SET status='failed', last_error=$3, attempts=GREATEST(attempts,1)
		WHERE merchant_id=$1::uuid AND channel='telegram' AND event_key=$2`,
		merchantID, eventKey, reason)
	return err
}

func (t *Telegram) postMessage(ctx context.Context, chatID, text string) error {
	payload := map[string]any{"chat_id": chatID, "text": text, "disable_web_page_preview": true}
	b, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, t.apiURL("sendMessage"), bytes.NewReader(b))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := t.client().Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if resp.StatusCode == 429 || resp.StatusCode >= 500 {
		return fmt.Errorf("telegram temporary status %d", resp.StatusCode)
	}
	if resp.StatusCode >= 300 {
		return fmt.Errorf("telegram status %d", resp.StatusCode)
	}
	var parsed struct {
		OK bool `json:"ok"`
	}
	_ = json.Unmarshal(body, &parsed)
	if !parsed.OK && len(body) > 0 && bytes.Contains(body, []byte(`"ok"`)) {
		return fmt.Errorf("telegram api not ok")
	}
	return nil
}

func (t *Telegram) paidText(locale, name, orderRef string, toman, usdtBase int64, network string) string {
	usdt := domain.FormatUSDTBaseUnits(usdtBase)
	net := strings.ToUpper(network)
	if locale == "fa" {
		who := name
		if who == "" {
			who = "مشتری"
		}
		return fmt.Sprintf("✅ پرداخت دریافت شد\n%s\n%s تومان\n%s USDT · %s\nسفارش #%s",
			who, domain.FormatToman(toman), usdt, net, orderRef)
	}
	who := name
	if who == "" {
		who = "Customer"
	}
	return fmt.Sprintf("✅ Payment received\n%s\n%s تومان\n%s USDT · %s\nOrder #%s",
		who, domain.FormatToman(toman), usdt, net, orderRef)
}

func (t *Telegram) attentionText(locale, orderRef, expected, received string) string {
	if locale == "fa" {
		msg := fmt.Sprintf("⚠️ پرداخت نیاز به بررسی دارد\nسفارش #%s", orderRef)
		if expected != "" {
			msg += fmt.Sprintf("\nمبلغ انتظار:\n%s USDT", expected)
		}
		if received != "" {
			msg += fmt.Sprintf("\nمبلغ دریافتی:\n%s USDT", received)
		}
		msg += "\nپرداخت را بررسی کنید"
		return msg
	}
	msg := fmt.Sprintf("⚠️ Payment needs attention\nOrder #%s", orderRef)
	if expected != "" {
		msg += fmt.Sprintf("\nExpected:\n%s USDT", expected)
	}
	if received != "" {
		msg += fmt.Sprintf("\nReceived:\n%s USDT", received)
	}
	msg += "\nReview payment"
	return msg
}

func isRetryable(err error) bool {
	if err == nil {
		return false
	}
	s := err.Error()
	return strings.Contains(s, "temporary") || strings.Contains(s, "timeout") || strings.Contains(s, "connection")
}

func truncateErr(err error) string {
	if err == nil {
		return ""
	}
	s := err.Error()
	if len(s) > 200 {
		return s[:200]
	}
	return s
}

func isInvalidUUID(err error) bool {
	if err == nil {
		return false
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == "22P02"
	}
	return strings.Contains(err.Error(), "invalid input syntax for type uuid")
}

// Ensure unused import guard for pgx in some builds.
var _ = pgx.ErrNoRows
