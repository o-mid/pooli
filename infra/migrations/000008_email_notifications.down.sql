ALTER TABLE notification_deliveries
    DROP COLUMN IF EXISTS last_error_category,
    DROP COLUMN IF EXISTS provider_message_id,
    DROP COLUMN IF EXISTS provider;

ALTER TABLE merchants
    DROP CONSTRAINT IF EXISTS merchants_preferred_locale_check;

ALTER TABLE merchants
    DROP COLUMN IF EXISTS preferred_locale,
    DROP COLUMN IF EXISTS notify_email_order_updates,
    DROP COLUMN IF EXISTS notify_email_payment_attention,
    DROP COLUMN IF EXISTS notify_email_payment_received;
