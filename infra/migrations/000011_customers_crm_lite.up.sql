-- Lightweight merchant-owned customer notes and tags (not a full CRM).

CREATE TABLE IF NOT EXISTS customer_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    body TEXT NOT NULL CHECK (char_length(btrim(body)) > 0 AND char_length(body) <= 2000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_notes_customer_idx
    ON customer_notes (merchant_id, customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS customer_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    tag TEXT NOT NULL CHECK (char_length(btrim(tag)) > 0 AND char_length(tag) <= 40),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS customer_tags_uniq
    ON customer_tags (merchant_id, customer_id, lower(tag));

CREATE INDEX IF NOT EXISTS customer_tags_merchant_tag_idx
    ON customer_tags (merchant_id, lower(tag));
