ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'pwa';

CREATE TABLE IF NOT EXISTS instagram_bind_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS instagram_bind_codes_merchant_idx
    ON instagram_bind_codes (merchant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS instagram_connections (
    merchant_id UUID PRIMARY KEY REFERENCES merchants(id) ON DELETE CASCADE,
    igsid TEXT NOT NULL UNIQUE,
    ig_username TEXT NOT NULL DEFAULT '',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    connected_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS instagram_conversations (
    igsid TEXT PRIMARY KEY,
    merchant_id UUID NULL REFERENCES merchants(id) ON DELETE SET NULL,
    state TEXT NOT NULL DEFAULT 'idle',
    pending_amount_toman BIGINT NULL,
    pending_title TEXT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS instagram_updates (
    event_key TEXT PRIMARY KEY,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
