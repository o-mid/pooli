-- Phase 2: merchant storefront identity + Iranian phone OTP

ALTER TABLE users
  ALTER COLUMN email DROP NOT NULL,
  ALTER COLUMN password_hash DROP NOT NULL,
  ALTER COLUMN password_hash SET DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone_e164 TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ;

ALTER TABLE users
  ADD CONSTRAINT users_email_or_phone CHECK (
    (email IS NOT NULL AND btrim(email) <> '')
    OR (phone_e164 IS NOT NULL AND btrim(phone_e164) <> '')
  );

ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS display_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS logo_path TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS support_contact TEXT NOT NULL DEFAULT '';

UPDATE merchants SET display_name = name WHERE display_name = '';

CREATE TABLE IF NOT EXISTS otp_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_e164 TEXT NOT NULL,
    purpose TEXT NOT NULL CHECK (purpose IN ('login', 'register', 'link')),
    code_hash TEXT NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 5,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS otp_challenges_phone_purpose_idx
  ON otp_challenges (phone_e164, purpose, created_at DESC);

CREATE TABLE IF NOT EXISTS otp_rate_limits (
    key TEXT PRIMARY KEY,
    window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    hit_count INT NOT NULL DEFAULT 0
);
