-- USDT-native order pricing (Phase A). Legacy TMN rows keep fiat_amount_toman for reads.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS amount_usdt_base_units BIGINT;

-- One-time backfill for existing TMN orders using frozen 126000 TMN/USDT (see ADR-009).
UPDATE orders
SET amount_usdt_base_units = ((fiat_amount_toman::numeric * 1000000) / 126000)::bigint
WHERE amount_usdt_base_units IS NULL
  AND fiat_amount_toman > 0;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_fiat_amount_toman_check;
ALTER TABLE orders ALTER COLUMN fiat_amount_toman DROP NOT NULL;
ALTER TABLE orders ADD CONSTRAINT orders_fiat_amount_toman_nonneg CHECK (fiat_amount_toman IS NULL OR fiat_amount_toman >= 0);
ALTER TABLE orders ADD CONSTRAINT orders_has_pricing CHECK (
    (amount_usdt_base_units IS NOT NULL AND amount_usdt_base_units > 0)
    OR (fiat_amount_toman IS NOT NULL AND fiat_amount_toman > 0)
);
