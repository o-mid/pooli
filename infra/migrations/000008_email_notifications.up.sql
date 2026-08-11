-- Transactional email notification preferences + delivery metadata (Resend).

ALTER TABLE merchants
    ADD COLUMN IF NOT EXISTS notify_email_payment_received BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS notify_email_payment_attention BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS notify_email_order_updates BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS preferred_locale TEXT NOT NULL DEFAULT 'fa';

ALTER TABLE merchants
    DROP CONSTRAINT IF EXISTS merchants_preferred_locale_check;
ALTER TABLE merchants
    ADD CONSTRAINT merchants_preferred_locale_check
    CHECK (preferred_locale IN ('en', 'fa'));

ALTER TABLE notification_deliveries
    ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS provider_message_id TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS last_error_category TEXT NOT NULL DEFAULT '';
