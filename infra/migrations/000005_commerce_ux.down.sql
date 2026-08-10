-- Rollback commerce UX additive schema.
-- Note: drops customer/fulfillment/timeline data; payment intents/orders remain.

ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_default_address_fk;

DROP TABLE IF EXISTS order_timeline_events;
DROP INDEX IF EXISTS orders_merchant_fulfillment_idx;
DROP INDEX IF EXISTS orders_merchant_customer_idx;

ALTER TABLE orders
    DROP COLUMN IF EXISTS fulfillment_note,
    DROP COLUMN IF EXISTS delivered_at,
    DROP COLUMN IF EXISTS shipped_at,
    DROP COLUMN IF EXISTS tracking_number,
    DROP COLUMN IF EXISTS shipping_provider,
    DROP COLUMN IF EXISTS fulfillment_status,
    DROP COLUMN IF EXISTS customer_id;

DROP TABLE IF EXISTS customer_addresses;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS merchant_checkout_defaults;
