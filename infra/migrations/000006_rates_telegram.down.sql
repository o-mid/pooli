ALTER TABLE merchants
    DROP COLUMN IF EXISTS notify_payment_received,
    DROP COLUMN IF EXISTS notify_payment_attention;

DROP TABLE IF EXISTS telegram_updates;

DROP INDEX IF EXISTS notification_deliveries_idempotent_uniq;
ALTER TABLE notification_deliveries
    DROP COLUMN IF EXISTS event_key,
    DROP COLUMN IF EXISTS payment_intent_id;

ALTER TABLE telegram_connections
    DROP COLUMN IF EXISTS telegram_user_id,
    DROP COLUMN IF EXISTS username,
    DROP COLUMN IF EXISTS connected_at;

DROP TABLE IF EXISTS telegram_connect_tokens;

ALTER TABLE exchange_rate_quotes
    DROP COLUMN IF EXISTS metadata_json;
