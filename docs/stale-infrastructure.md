# Stale / reserved infrastructure notes

These items exist in config or docs history but are **not** active in the V1 runtime:

| Item | Reality |
|------|---------|
| Redis / `REDIS_URL` | Compose may include Redis; Go API/worker do not use it. Safe to ignore. |
| `CSRF_SECRET` | Documented in `.env.example` as unimplemented. Session cookies are used for merchant auth. |
| Railway | Obsolete hosting path. Production uses Docker Compose (`deploy/hostinger/`). |

Do not wire Redis or CSRF in this sprint unless a concrete security/product need appears.
