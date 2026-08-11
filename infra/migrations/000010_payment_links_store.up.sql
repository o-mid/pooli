-- Reusable payment link templates + lightweight order commerce fields.
-- Templates never reuse payment intents; each checkout session creates a fresh order+intent.

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS item_quantity INT NOT NULL DEFAULT 1
        CHECK (item_quantity > 0 AND item_quantity <= 10000),
    ADD COLUMN IF NOT EXISTS image_path TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS internal_note TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS success_message TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS payment_link_id UUID NULL;

CREATE TABLE IF NOT EXISTS payment_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    mode TEXT NOT NULL DEFAULT 'fixed'
        CHECK (mode IN ('fixed', 'custom_amount')),
    fiat_amount_toman BIGINT NOT NULL DEFAULT 0
        CHECK (fiat_amount_toman >= 0),
    min_amount_toman BIGINT NOT NULL DEFAULT 0
        CHECK (min_amount_toman >= 0),
    max_amount_toman BIGINT NOT NULL DEFAULT 0
        CHECK (max_amount_toman >= 0),
    image_path TEXT NOT NULL DEFAULT '',
    success_message TEXT NOT NULL DEFAULT '',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    expires_in_minutes INT NOT NULL DEFAULT 60
        CHECK (expires_in_minutes > 0 AND expires_in_minutes <= 10080),
    customer_fields_json JSONB NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT payment_links_fixed_amount CHECK (
        mode <> 'fixed' OR fiat_amount_toman > 0
    )
);

CREATE INDEX IF NOT EXISTS payment_links_merchant_idx
    ON payment_links (merchant_id, active, created_at DESC);

ALTER TABLE orders
    DROP CONSTRAINT IF EXISTS orders_payment_link_id_fkey;
ALTER TABLE orders
    ADD CONSTRAINT orders_payment_link_id_fkey
    FOREIGN KEY (payment_link_id) REFERENCES payment_links(id) ON DELETE SET NULL;
