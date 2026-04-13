# Pooli Architecture

Pooli is a non-custodial USDT payment/order product for social-commerce sellers.

## Shape

- `apps/web` — Next.js PWA (merchant dashboard + public checkout `/p/{slug}` + admin)
- `apps/api` — Go HTTP API (chi)
- `apps/chain-worker` — Go background worker (observe → verify → match → notify)
- Shared Go packages under `internal/`
- PostgreSQL source of truth, Redis for jobs/cache/SSE fanout helpers

## Money model

- Seller amounts are **TMN (toman)** integers.
- USDT is tracked in **base units** (6 decimals) as `int64`.
- Rates are `NUMERIC` with source + timestamps; never float for matching.

## Payment matching

Buyer pays USDT directly to the merchant wallet. Pooli maps transfers to payment options via **unique payable amount** per `(destination, network, token, active reservation)`.

## Chain adapters

`ChainAdapter` normalizes TRON and EVM transfers into a common `ChainEvent`. Only server-side verification can transition an intent to `PAID`.

## Realtime

SSE streams `payment.*` events to checkout and merchant dashboards. Clients always refetch canonical REST state on reconnect.

## Non-goals (V1)

No custody, private keys, fiat settlement, swaps, or multi-token support.
