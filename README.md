# Pooli

Turn a DM order into a checkout link. Non-custodial USDT payments for social-commerce sellers on TRON (TRC-20) and BNB Smart Chain (BEP-20).

Primary domain: `pooli.shop`

## Stack

- `apps/web` — Next.js PWA (merchant + public checkout)
- `apps/api` — Go HTTP API
- `apps/chain-worker` — Go chain observer / matcher
- PostgreSQL (Docker Compose; Redis is present but unused by Go services today)
- Production: self-hosted Docker Compose — see [`docs/self-hosting.md`](docs/self-hosting.md)

## Quick start

```bash
cp .env.example .env
docker compose up -d
go mod tidy
go run ./cmd/migrate up

# terminal 1
go run ./apps/api

# terminal 2
go run ./apps/chain-worker

# terminal 3
cd apps/web && npm install && npm run dev
```

Open http://localhost:3000

## Local payment simulation

With `ENABLE_CHAIN_SIMULATOR=true` (default in `.env.example`):

```bash
make simulate-pay PAYMENT_OPTION_ID=<option-uuid>
```

## Docs

- [Architecture](docs/architecture.md)
- [Payment lifecycle](docs/payment-lifecycle.md)
- [Local development](docs/local-development.md)
- [Self-hosting](docs/self-hosting.md)
- [External services setup](docs/external-services-setup.md)
- [TRON mainnet pilot](docs/tron-mainnet-pilot.md)
- [Security](docs/security.md)
- [Implementation plan](docs/implementation-plan.md)
- [ADRs](docs/decisions/)

Ops (when deployed): `GET /api/v1/ops/status` on your API host

## MVP principles

- Non-custodial only — never store private keys
- Unique payable amount matching
- Server-side verification only can mark `PAID`
- SSE for live status updates
