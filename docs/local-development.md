# Local Development

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
pnpm install
pnpm --filter @pooli/web dev
```

Open `http://localhost:3000`.

## Demo flow

1. Register merchant
2. Add TRON + BSC wallet addresses
3. Create 3,800,000 TMN order
4. Open `/p/{slug}`, enter customer details, choose network
5. Simulate payment: `make simulate-pay PAYMENT_OPTION_ID=...`
6. Watch order become PAID via SSE

Chain simulator requires `ENABLE_CHAIN_SIMULATOR=true`.

## Verification

```bash
docker compose up -d
go run ./cmd/migrate up
make verify
```

`make verify` runs isolated Go tests (DB truncate between cases), the checkout→simulate→PAID vertical slice, duplicate-payment handling, concurrent unique amounts, and an API restart persistence check.
