package notify

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pooli-shop/pooli/internal/domain"
)

type Telegram struct {
	Pool    *pgxpool.Pool
	Token   string
	Enabled bool
	HTTP    *http.Client
}

func (t *Telegram) NotifyPaid(ctx context.Context, merchantID, orderRef string, toman int64, usdtBase int64, network, txHash string) error {
	if !t.Enabled || t.Token == "" {
		return nil
	}
	var chatID string
	err := t.Pool.QueryRow(ctx, `
		SELECT chat_id FROM telegram_connections WHERE merchant_id=$1::uuid AND enabled=true`, merchantID).Scan(&chatID)
	if err != nil {
		return nil
	}
	text := fmt.Sprintf("🟢 Payment received\nOrder #%s\n%s Toman\n%s USDT\nNetwork: %s\nTx: %s",
		orderRef, domain.FormatToman(toman), domain.FormatUSDTBaseUnits(usdtBase), network, txHash)
	payload := map[string]any{"chat_id": chatID, "text": text}
	b, _ := json.Marshal(payload)
	client := t.HTTP
	if client == nil {
		client = &http.Client{Timeout: 8 * time.Second}
	}
	url := "https://api.telegram.org/bot" + t.Token + "/sendMessage"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(b))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		_, _ = t.Pool.Exec(ctx, `
			INSERT INTO notification_deliveries (merchant_id, channel, event_type, payload_json, status, attempts, last_error)
			VALUES ($1::uuid,'telegram','payment.paid',$2::jsonb,'failed',1,$3)`, merchantID, string(b), err.Error())
		return err
	}
	defer resp.Body.Close()
	status := "delivered"
	if resp.StatusCode >= 300 {
		status = "failed"
	}
	_, _ = t.Pool.Exec(ctx, `
		INSERT INTO notification_deliveries (merchant_id, channel, event_type, payload_json, status, attempts, delivered_at)
		VALUES ($1::uuid,'telegram','payment.paid',$2::jsonb,$3,1,CASE WHEN $3='delivered' THEN now() ELSE NULL END)`,
		merchantID, string(b), status)
	return nil
}
