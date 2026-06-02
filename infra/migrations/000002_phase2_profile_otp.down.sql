DROP TABLE IF EXISTS otp_rate_limits;
DROP TABLE IF EXISTS otp_challenges;

ALTER TABLE merchants
  DROP COLUMN IF EXISTS support_contact,
  DROP COLUMN IF EXISTS logo_path,
  DROP COLUMN IF EXISTS description,
  DROP COLUMN IF EXISTS display_name;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_or_phone;
ALTER TABLE users
  DROP COLUMN IF EXISTS phone_verified_at,
  DROP COLUMN IF EXISTS email_verified_at,
  DROP COLUMN IF EXISTS phone_e164;

-- email/password NOT NULL restoration is intentionally omitted when phone-only rows exist.
