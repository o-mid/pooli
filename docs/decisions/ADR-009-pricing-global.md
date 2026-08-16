# ADR-009: Global pricing model (USDT-native)

## Status

Accepted (2026-10-11)

## Context

Pooli pivots from Iran-first toman checkout to a global DM-seller product. Live TMN/USDT exchange quotes (Nobitex/Wallex) added operational coupling and failure modes on the payment critical path.

## Decision

**Option A — USDT-native** (playbook §3.1):

- Merchants enter the payable amount in **USDT** (6 decimal places internally as `amount_usdt_base_units`).
- New orders default `fiat_currency` to `USDT`.
- Payment intent creation uses `orders.amount_usdt_base_units` directly for base USDT and unique-amount reservation — **no live fiat rate fetch** on that path.
- Legacy `fiat_amount_toman` remains on existing rows and as a **deprecated** JSON alias for one release; new clients send `amount_usdt_base_units`.

## Backfill

Migration `000014_usdt_native` backfills `amount_usdt_base_units` for historical TMN orders using a **frozen** rate of **126000 TMN per 1 USDT** (same scale as prior mock/CI defaults). This is a one-time approximation for old rows, not a live quote.

## Consequences

- Production USDT-native checkout does not require Nobitex/Wallex (see ADR-012).
- Merchant and buyer UX lead with USDT; FA locale remains supported without toman-first positioning.
- Metrics and APIs may expose both fields during dual-read; prefer `amount_usdt_base_units` + `fiat_currency` for new integrations.

## Supersedes

Rate-provider requirements in [ADR-003](./ADR-003-providers.md) for checkout quoting — detailed in [ADR-012](./ADR-012-supersede-rate-providers.md).
