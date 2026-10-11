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
3. Create an order priced in USDT (e.g. `12.50` USDT)
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

## Action gateway (optional)

```bash
cd apps/action-gateway
npm install
npm run build
export AGENT_GATEWAY_SECRET=dev-gateway-secret   # same in API .env
export POOLI_API_URL=http://127.0.0.1:8080
export POOLI_GATEWAY_SECRET=dev-gateway-secret
export PUBLIC_URL=http://localhost:8787
node server.mjs
```

Set `NEXT_PUBLIC_ACTION_GATEWAY_URL=http://localhost:8787` in `.env` and restart the web app to use the merchant proposal sheet.

```bash
make verify-agent
```
