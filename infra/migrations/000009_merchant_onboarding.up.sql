-- Merchant onboarding progress + operational status (not KYC).
-- Additive only; existing merchants default to active with onboarding complete.

ALTER TABLE merchants
    ADD COLUMN IF NOT EXISTS operational_status TEXT NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS support_email TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS support_phone TEXT NOT NULL DEFAULT '';

ALTER TABLE merchants
    DROP CONSTRAINT IF EXISTS merchants_operational_status_check;
ALTER TABLE merchants
    ADD CONSTRAINT merchants_operational_status_check
    CHECK (operational_status IN ('new', 'active', 'review_required', 'suspended'));

-- Existing merchants already operate; mark onboarding complete.
UPDATE merchants
SET onboarding_completed_at = COALESCE(onboarding_completed_at, created_at)
WHERE onboarding_completed_at IS NULL;

-- New signups after this migration start as 'new' (application sets on insert/update).
-- Backfill: keep existing rows 'active'.

ALTER TABLE merchant_checkout_defaults
    ADD COLUMN IF NOT EXISTS success_message TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS checkout_accent TEXT NOT NULL DEFAULT 'teal';

ALTER TABLE merchant_checkout_defaults
    DROP CONSTRAINT IF EXISTS merchant_checkout_defaults_accent_check;
ALTER TABLE merchant_checkout_defaults
    ADD CONSTRAINT merchant_checkout_defaults_accent_check
    CHECK (checkout_accent IN ('teal', 'blue', 'green', 'amber', 'rose', 'slate'));
