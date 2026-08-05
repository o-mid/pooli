# ADR-005: TRON mainnet payment rail

## Context

Phase 3 makes USDT-TRC20 on TRON the first real payment rail. BSC mainnet is covered separately in ADR-006 (Phase 4).

## Decisions

1. **Finality:** `depth = latestBlockNumber - txBlockNumber + 1`. Tip comes from TronGrid `/wallet/getnowblock`. Tx block from `/wallet/gettransactioninfobyid`. Timestamps are never used as block numbers.
2. **Confirmations:** Default `TRON_CONFIRMATIONS=20` on mainnet (overrideable). Nile/local may use a lower value.
3. **Cursor:** Durable `min_timestamp` with short-lived `fingerprint` pagination. On resume, re-read with a bounded overlap; idempotency via `chain_events.event_id`.
4. **Reservations:** `active` → `matched` on first EXACT transfer → `consumed` on PAID. Partial unique index holds amounts for both `active` and `matched`.
5. **UI updates:** DB is source of truth. Checkout/order pages REST-poll while `AWAITING_PAYMENT|SEEN|CONFIRMING`. SSE is best-effort. No Redis pub/sub in Phase 3.
6. **Mainnet guards:** Worker refuses mainnet without API key, official USDT contract, and with simulator enabled.

## Consequences

Pilot can run a single API + worker process. Horizontal API scale still needs a later fan-out mechanism.
