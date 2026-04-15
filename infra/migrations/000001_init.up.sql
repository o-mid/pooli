CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE merchants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE merchant_users (
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'staff')),
    PRIMARY KEY (merchant_id, user_id)
);

CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE merchant_wallet_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    network TEXT NOT NULL CHECK (network IN ('tron', 'bsc')),
    chain_id BIGINT NULL,
    address TEXT NOT NULL,
    address_normalized TEXT NOT NULL,
    asset TEXT NOT NULL DEFAULT 'USDT',
    contract_address TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    verified_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, network, address_normalized, contract_address)
);

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    merchant_reference TEXT NOT NULL DEFAULT '',
    fiat_amount_toman BIGINT NOT NULL CHECK (fiat_amount_toman > 0),
    fiat_currency TEXT NOT NULL DEFAULT 'TMN',
    status TEXT NOT NULL DEFAULT 'CREATED',
    expires_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX orders_merchant_id_idx ON orders(merchant_id, created_at DESC);

CREATE TABLE order_field_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    field_key TEXT NOT NULL,
    label TEXT NOT NULL,
    field_type TEXT NOT NULL CHECK (field_type IN ('text', 'phone', 'email', 'textarea', 'select')),
    required BOOLEAN NOT NULL DEFAULT FALSE,
    options_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    sort_order INT NOT NULL DEFAULT 0,
    UNIQUE (order_id, field_key)
);

CREATE TABLE order_field_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    field_key TEXT NOT NULL,
    label TEXT NOT NULL,
    field_type TEXT NOT NULL,
    value TEXT NOT NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (order_id, field_key)
);

CREATE TABLE exchange_rate_quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usdt_tmn_rate NUMERIC(24, 12) NOT NULL,
    source TEXT NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE payment_intents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
    fiat_amount_toman BIGINT NOT NULL,
    fiat_currency TEXT NOT NULL DEFAULT 'TMN',
    status TEXT NOT NULL DEFAULT 'CREATED',
    quote_id UUID NULL REFERENCES exchange_rate_quotes(id),
    expires_at TIMESTAMPTZ NOT NULL,
    paid_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE payment_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_intent_id UUID NOT NULL REFERENCES payment_intents(id) ON DELETE CASCADE,
    network TEXT NOT NULL CHECK (network IN ('tron', 'bsc')),
    chain_id BIGINT NULL,
    token_contract TEXT NOT NULL,
    destination_address TEXT NOT NULL,
    destination_address_normalized TEXT NOT NULL,
    base_usdt_amount_base_units BIGINT NOT NULL,
    pay_usdt_amount_base_units BIGINT NOT NULL,
    quote_rate NUMERIC(24, 12) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX payment_options_intent_idx ON payment_options(payment_intent_id);

CREATE TABLE amount_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_option_id UUID NOT NULL UNIQUE REFERENCES payment_options(id) ON DELETE CASCADE,
    destination_address_normalized TEXT NOT NULL,
    network TEXT NOT NULL,
    token_contract TEXT NOT NULL,
    pay_amount_base_units BIGINT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released', 'consumed')),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX amount_reservations_active_uniq
    ON amount_reservations (destination_address_normalized, network, token_contract, pay_amount_base_units)
    WHERE status = 'active';

CREATE TABLE chain_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT NOT NULL UNIQUE,
    network TEXT NOT NULL,
    chain_id BIGINT NULL,
    tx_hash TEXT NOT NULL,
    log_index INT NULL,
    token_contract TEXT NOT NULL,
    from_address TEXT NOT NULL,
    to_address TEXT NOT NULL,
    to_address_normalized TEXT NOT NULL,
    amount_base_units BIGINT NOT NULL,
    block_number BIGINT NOT NULL DEFAULT 0,
    confirmations INT NOT NULL DEFAULT 0,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    raw_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    processed_at TIMESTAMPTZ NULL
);

CREATE INDEX chain_events_match_idx
    ON chain_events (to_address_normalized, network, token_contract, amount_base_units);

CREATE TABLE matched_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chain_event_id UUID NOT NULL UNIQUE REFERENCES chain_events(id),
    payment_intent_id UUID NOT NULL REFERENCES payment_intents(id),
    payment_option_id UUID NOT NULL REFERENCES payment_options(id),
    match_type TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE payment_state_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_intent_id UUID NOT NULL REFERENCES payment_intents(id) ON DELETE CASCADE,
    from_status TEXT NOT NULL,
    to_status TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    actor TEXT NOT NULL DEFAULT 'system',
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX payment_state_events_intent_idx ON payment_state_events(payment_intent_id, created_at);

CREATE TABLE telegram_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL UNIQUE REFERENCES merchants(id) ON DELETE CASCADE,
    chat_id TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notification_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    channel TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload_json JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INT NOT NULL DEFAULT 0,
    last_error TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivered_at TIMESTAMPTZ NULL
);

CREATE TABLE webhook_endpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    secret TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    endpoint_id UUID NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
    event_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload_json JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INT NOT NULL DEFAULT 0,
    last_error TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivered_at TIMESTAMPTZ NULL,
    UNIQUE (endpoint_id, event_id)
);

CREATE TABLE subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    included_paid_payments INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL UNIQUE REFERENCES merchants(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES subscription_plans(id),
    status TEXT NOT NULL DEFAULT 'active',
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ends_at TIMESTAMPTZ NULL
);

CREATE TABLE usage_counters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    period_ym TEXT NOT NULL,
    verified_payments INT NOT NULL DEFAULT 0,
    UNIQUE (merchant_id, period_ym)
);

CREATE TABLE audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID NULL REFERENCES users(id),
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE watcher_cursors (
    network TEXT PRIMARY KEY,
    cursor_value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO subscription_plans (code, name, included_paid_payments) VALUES
    ('free', 'Free', 25),
    ('pro', 'Pro', 500),
    ('business', 'Business', 5000);
