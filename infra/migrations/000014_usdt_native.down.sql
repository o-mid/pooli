ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_has_pricing;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_fiat_amount_toman_nonneg;
ALTER TABLE orders ALTER COLUMN fiat_amount_toman SET NOT NULL;
ALTER TABLE orders ADD CONSTRAINT orders_fiat_amount_toman_check CHECK (fiat_amount_toman > 0);

ALTER TABLE orders DROP COLUMN IF EXISTS amount_usdt_base_units;
