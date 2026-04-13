# Security

## Hard rules

- Never store seed phrases or private keys.
- Secrets only via environment / secret manager.
- Token contracts are allowlisted per network.
- Addresses are validated and normalized per network.
- Amount matching uses integer base units inside DB transactions.
- Chain event ingest is idempotent.
- Only backend verification can mark `PAID`.
- Customer PII is scoped to owning merchant + admin.

## Wallet ownership (V1 fallback)

Signed challenge verification is not required for MVP. Merchants may register public addresses after format validation. Documented temporary fallback; signed ownership proofs are planned.

## Auth

Email/password sessions with HTTP-only cookies. Admin emails allowlisted via `ADMIN_EMAILS`.

## Public endpoints

Rate-limited. No internal provider details leaked.
