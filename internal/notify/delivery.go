package notify

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pooli-shop/pooli/internal/email"
)

// beginDelivery claims an idempotent delivery row. Returns ok=false when already claimed.
func beginDelivery(ctx context.Context, pool *pgxpool.Pool, merchantID, channel, intentID, eventType, eventKey string, payload map[string]any) (bool, error) {
	b, _ := json.Marshal(payload)
	tag, err := pool.Exec(ctx, `
		INSERT INTO notification_deliveries (
			merchant_id, channel, event_type, event_key, payment_intent_id, payload_json, status, attempts
		) VALUES (
			$1::uuid, $2, $3, $4,
			NULLIF($5,'')::uuid, $6::jsonb, 'pending', 0
		)
		ON CONFLICT (merchant_id, channel, event_key) WHERE event_key IS NOT NULL
		DO NOTHING`, merchantID, channel, eventType, eventKey, intentID, string(b))
	if err != nil {
		if isInvalidUUID(err) {
			tag, err = pool.Exec(ctx, `
				INSERT INTO notification_deliveries (
					merchant_id, channel, event_type, event_key, payload_json, status, attempts
				) VALUES ($1::uuid,$2,$3,$4,$5::jsonb,'pending',0)
				ON CONFLICT (merchant_id, channel, event_key) WHERE event_key IS NOT NULL
				DO NOTHING`, merchantID, channel, eventType, eventKey, string(b))
		}
		if err != nil {
			return false, err
		}
	}
	return tag.RowsAffected() == 1, nil
}

func markDelivered(ctx context.Context, pool *pgxpool.Pool, merchantID, channel, eventKey, provider, providerMsgID string, attempts int) {
	_, _ = pool.Exec(ctx, `
		UPDATE notification_deliveries
		SET status='delivered', attempts=$4, delivered_at=now(), last_error='',
		    last_error_category='', provider=$5, provider_message_id=$6
		WHERE merchant_id=$1::uuid AND channel=$2 AND event_key=$3`,
		merchantID, channel, eventKey, attempts, provider, providerMsgID)
}

func markFailed(ctx context.Context, pool *pgxpool.Pool, merchantID, channel, eventKey string, attempts int, err error) {
	cat := string(email.CategoryOf(err))
	_, _ = pool.Exec(ctx, `
		UPDATE notification_deliveries
		SET status='failed', attempts=$4, last_error=$5, last_error_category=$6
		WHERE merchant_id=$1::uuid AND channel=$2 AND event_key=$3`,
		merchantID, channel, eventKey, attempts, truncateErr(err), cat)
}

func redactSecrets(s string) string {
	if s == "" {
		return ""
	}
	lower := strings.ToLower(s)
	if strings.Contains(lower, "re_") || strings.Contains(lower, "bearer ") || strings.Contains(lower, "api_key") {
		return "redacted"
	}
	return s
}
