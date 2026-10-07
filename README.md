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

## Agent safety

Buyer follow-up drafts go through **propose → merchant confirm**, not direct send from the model. The MCP gateway exposes three tools (snapshot, propose, status); payment status is grounded on the Go API and drafts are linted server-side (for example, no “paid” wording while status is still `AWAITING_PAYMENT`).

- Integration guide: [`docs/agent-integration.md`](docs/agent-integration.md)
- Gateway threat model: [`apps/action-gateway/README.md`](apps/action-gateway/README.md)
- Deterministic eval set: [`evals/dataset/cases.yaml`](evals/dataset/cases.yaml) (`make evals`)

```bash
make evals          # 30+ gateway rule cases, no LLM
make verify-agent   # evals + gateway unit tests + sticky e2e
```

## Docs

- [Architecture](docs/architecture.md)
- [Agent integration (MCP)](docs/agent-integration.md)
- [Payment lifecycle](docs/payment-lifecycle.md)
- [Local development](docs/local-development.md)
- [Self-hosting](docs/self-hosting.md)
- [External services setup](docs/external-services-setup.md)
- [TRON mainnet pilot](docs/tron-mainnet-pilot.md)
- [Security](docs/security.md)
- [Implementation plan](docs/implementation-plan.md)
- [ADRs](docs/decisions/)

Ops (when deployed): `GET /api/v1/ops/status` on your API host

## Public identity

Marketing pages, imprint, and machine-readable footprint read from `apps/web/src/lib/site.ts`. Optional env: `NEXT_PUBLIC_GEMI_NUMBER`, `NEXT_PUBLIC_VAT_NUMBER`, `NEXT_PUBLIC_FOUNDING_YEAR`, `NEXT_PUBLIC_SITE_BUILD_DATE` (see `.env.example`).

External profiles to keep aligned manually: [LinkedIn company](https://www.linkedin.com/company/poolishop), founder LinkedIn, [GitHub repo](https://github.com/o-mid/pooli), [@PooliShopbot](https://t.me/PooliShopbot).

Public routes: `/`, `/about`, `/contact`, `/faq`, `/security`, `/privacy`, `/terms`, plus `/sitemap.xml`, `/robots.txt`, `/llms.txt`, `/humans.txt`, `/.well-known/security.txt`.

## MVP principles

- Non-custodial only — never store private keys
- Unique payable amount matching
- Server-side verification only can mark `PAID`
- SSE for live status updates
