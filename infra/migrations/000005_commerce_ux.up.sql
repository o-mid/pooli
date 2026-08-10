-- Commerce UX: merchant defaults, customers, fulfillment, timeline.
-- Forward-safe: additive columns/tables only; existing payment rows unchanged.

CREATE TABLE IF NOT EXISTS merchant_checkout_defaults (
    merchant_id UUID PRIMARY KEY REFERENCES merchants(id) ON DELETE CASCADE,
    customer_fields_json JSONB NOT NULL DEFAULT '{
      "full_name":"required",
      "phone":"required",
      "shipping_address":"required",
      "postal_code":"optional",
      "email":"disabled",
      "customer_note":"disabled"
    }'::jsonb,
    enabled_networks TEXT[] NOT NULL DEFAULT ARRAY['tron','bsc']::text[],
    default_network TEXT NOT NULL DEFAULT 'tron'
        CHECK (default_network IN ('tron', 'bsc')),
    default_expiry_minutes INT NOT NULL DEFAULT 60
        CHECK (default_expiry_minutes > 0 AND default_expiry_minutes <= 10080),
    fulfillment_required BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO merchant_checkout_defaults (merchant_id)
SELECT id FROM merchants
ON CONFLICT (merchant_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL DEFAULT '',
    phone_e164 TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    default_address_id UUID NULL,
    order_count INT NOT NULL DEFAULT 0,
    lifetime_paid_toman BIGINT NOT NULL DEFAULT 0,
    last_order_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT customers_contact_present CHECK (
        btrim(phone_e164) <> '' OR btrim(email) <> ''
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS customers_merchant_phone_uniq
    ON customers (merchant_id, phone_e164)
    WHERE btrim(phone_e164) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS customers_merchant_email_uniq
    ON customers (merchant_id, lower(email))
    WHERE btrim(email) <> '';

CREATE INDEX IF NOT EXISTS customers_merchant_updated_idx
    ON customers (merchant_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS customers_merchant_name_idx
    ON customers (merchant_id, full_name);

CREATE TABLE IF NOT EXISTS customer_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    recipient_name TEXT NOT NULL DEFAULT '',
    phone_e164 TEXT NOT NULL DEFAULT '',
    province TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    address_line TEXT NOT NULL DEFAULT '',
    postal_code TEXT NOT NULL DEFAULT '',
    label TEXT NOT NULL DEFAULT 'Home'
        CHECK (label IN ('Home', 'Work', 'Other')),
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_addresses_customer_idx
    ON customer_addresses (customer_id, created_at DESC);

ALTER TABLE customers
    DROP CONSTRAINT IF EXISTS customers_default_address_fk;
ALTER TABLE customers
    ADD CONSTRAINT customers_default_address_fk
    FOREIGN KEY (default_address_id) REFERENCES customer_addresses(id) ON DELETE SET NULL;

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS fulfillment_status TEXT NOT NULL DEFAULT 'UNFULFILLED'
        CHECK (fulfillment_status IN (
            'UNFULFILLED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'
        )),
    ADD COLUMN IF NOT EXISTS shipping_provider TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS tracking_number TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS fulfillment_note TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS orders_merchant_customer_idx
    ON orders (merchant_id, customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS orders_merchant_fulfillment_idx
    ON orders (merchant_id, fulfillment_status, updated_at DESC);

CREATE TABLE IF NOT EXISTS order_timeline_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'system'
        CHECK (source IN ('system', 'payment', 'fulfillment', 'merchant', 'buyer')),
    title TEXT NOT NULL DEFAULT '',
    detail TEXT NOT NULL DEFAULT '',
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    actor TEXT NOT NULL DEFAULT 'system',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_timeline_order_idx
    ON order_timeline_events (order_id, created_at ASC);

CREATE INDEX IF NOT EXISTS order_timeline_merchant_idx
    ON order_timeline_events (merchant_id, created_at DESC);

-- Backfill timeline for existing orders (order created + payment state history).
INSERT INTO order_timeline_events (order_id, merchant_id, event_type, source, title, actor, created_at)
SELECT o.id, o.merchant_id, 'order.created', 'system', 'Order created', 'system', o.created_at
FROM orders o
WHERE NOT EXISTS (
    SELECT 1 FROM order_timeline_events e
    WHERE e.order_id = o.id AND e.event_type = 'order.created'
);

INSERT INTO order_timeline_events (
    order_id, merchant_id, event_type, source, title, detail, metadata_json, actor, created_at
)
SELECT
    pi.order_id,
    pi.merchant_id,
    'payment.' || lower(pse.to_status),
    'payment',
    pse.to_status,
    COALESCE(pse.reason, ''),
    jsonb_build_object(
        'from_status', pse.from_status,
        'to_status', pse.to_status,
        'payment_intent_id', pse.payment_intent_id
    ),
    COALESCE(NULLIF(pse.actor, ''), 'system'),
    pse.created_at
FROM payment_state_events pse
JOIN payment_intents pi ON pi.id = pse.payment_intent_id
WHERE NOT EXISTS (
    SELECT 1 FROM order_timeline_events e
    WHERE e.order_id = pi.order_id
      AND e.event_type = 'payment.' || lower(pse.to_status)
      AND e.created_at = pse.created_at
);

INSERT INTO order_timeline_events (order_id, merchant_id, event_type, source, title, actor, created_at)
SELECT DISTINCT ON (ofv.order_id)
    ofv.order_id, o.merchant_id, 'customer.details_submitted', 'buyer',
    'Customer details submitted', 'buyer', ofv.submitted_at
FROM order_field_values ofv
JOIN orders o ON o.id = ofv.order_id
WHERE NOT EXISTS (
    SELECT 1 FROM order_timeline_events e
    WHERE e.order_id = ofv.order_id AND e.event_type = 'customer.details_submitted'
)
ORDER BY ofv.order_id, ofv.submitted_at ASC;
