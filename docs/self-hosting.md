# Self-hosting (production)

Pooli runs as Docker Compose: API, web, chain-worker, and Postgres. Example stack lives under `deploy/hostinger/` (Compose files + nginx templates).

## Secrets

Copy `.env.example` to `deploy/hostinger/.env` on your server. **Never commit** that file.

Required for production:

- `APP_ENV=production`
- `SESSION_SECRET`, database credentials
- `RATE_PROVIDER=nobitex` with `RATE_FALLBACK_PROVIDER=wallex` (mock is forbidden in production)
- `ENABLE_CHAIN_SIMULATOR=false`
- Chain keys: `TRONGRID_API_KEY`, etc.

See [external-services-setup.md](./external-services-setup.md) and [email-resend-setup.md](./email-resend-setup.md).

## Build and run

On the host, from your deploy directory:

```bash
docker compose build pooli-api pooli-chain-worker pooli-web
docker compose up -d --wait pooli-api pooli-chain-worker pooli-web
docker compose --profile migrate run --rm pooli-migrate
```

Put TLS/nginx in front of the web (default `:3100`) and API (`:8180`) ports. Sample vhost files are under `deploy/hostinger/nginx-*.conf.proposed`.

## WalletConnect (web build-time)

`NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` must be present **during** `docker compose build pooli-web`. Runtime env alone cannot change the client bundle.

## Health checks

- API: `GET /healthz`
- Ops: `GET /api/v1/ops/status` (non-secret enums; HTTP 503 when worker stale or misconfigured)
- After deploy: verify web login route returns 200 before switching traffic

## Local verification before deploy

```bash
go test ./...
ENABLE_CHAIN_SIMULATOR=true make verify   # must print VERIFY_MVP_OK
npm run verify --workspace=@pooli/web
```

Operator-specific deploy scripts and runbooks are kept outside this public repository.
