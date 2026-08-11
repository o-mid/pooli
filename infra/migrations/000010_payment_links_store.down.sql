ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_link_id_fkey;

ALTER TABLE orders
    DROP COLUMN IF EXISTS payment_link_id,
    DROP COLUMN IF EXISTS success_message,
    DROP COLUMN IF EXISTS internal_note,
    DROP COLUMN IF EXISTS image_path,
    DROP COLUMN IF EXISTS item_quantity;

DROP TABLE IF EXISTS payment_links;
