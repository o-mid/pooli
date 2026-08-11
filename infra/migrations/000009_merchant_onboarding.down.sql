ALTER TABLE merchant_checkout_defaults
    DROP CONSTRAINT IF EXISTS merchant_checkout_defaults_accent_check;

ALTER TABLE merchant_checkout_defaults
    DROP COLUMN IF EXISTS checkout_accent,
    DROP COLUMN IF EXISTS success_message;

ALTER TABLE merchants
    DROP CONSTRAINT IF EXISTS merchants_operational_status_check;

ALTER TABLE merchants
    DROP COLUMN IF EXISTS support_phone,
    DROP COLUMN IF EXISTS support_email,
    DROP COLUMN IF EXISTS onboarding_completed_at,
    DROP COLUMN IF EXISTS operational_status;
