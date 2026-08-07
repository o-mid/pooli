-- Google OAuth subject for sign-in / account linking

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS google_sub TEXT UNIQUE;
