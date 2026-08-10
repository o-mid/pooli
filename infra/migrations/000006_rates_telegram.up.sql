-- Rate quote metadata (provider policy / denomination)
ALTER TABLE exchange_rate_quotes
    ADD COLUMN IF NOT EXISTS metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Secure Telegram connect tokens (store hash only)
CREATE TABLE IF NOT EXISTS telegram_connect_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS telegram_connect_tokens_merchant_idx
    ON telegram_connect_tokens (merchant_id, created_at DESC);

ALTER TABLE telegram_connections
    ADD COLUMN IF NOT EXISTS telegram_user_id TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS username TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS connected_at TIMESTAMPTZ NULL;

-- Idempotent notification deliveries
ALTER TABLE notification_deliveries
    ADD COLUMN IF NOT EXISTS event_key TEXT NULL,
    ADD COLUMN IF NOT EXISTS payment_intent_id UUID NULL REFERENCES payment_intents(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS notification_deliveries_idempotent_uniq
    ON notification_deliveries (merchant_id, channel, event_key)
    WHERE event_key IS NOT NULL;

-- Processed Telegram updates (webhook idempotency)
CREATE TABLE IF NOT EXISTS telegram_updates (
    update_id BIGINT PRIMARY KEY,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Simple merchant notification prefs (defaults ON for paid + attention)
ALTER TABLE merchants
    ADD COLUMN IF NOT EXISTS notify_payment_received BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS notify_payment_attention BOOLEAN NOT NULL DEFAULT TRUE;
