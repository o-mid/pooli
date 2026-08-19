# ADR-012: Supersede live TMN rate providers for checkout

## Status

Accepted (2026-10-11)

## Supersedes

[ADR-003](./ADR-003-providers.md) — **Rates** row (Nobitex primary, Wallex fallback for checkout quoting).

## Decision

- **USDT-native orders** (ADR-009): checkout and intent creation do not call Nobitex/Wallex.
- **`RATE_PROVIDER=mock`** remains the default for local development and CI; production is not required to configure Iranian exchange APIs for the USDT-native path.
- Legacy TMN-only create payloads (`fiat_amount_toman` without `amount_usdt_base_units`) may still use `RateProvider` until removed; new product work assumes USDT-native.
- Chain adapters (TronGrid, BSC RPC) and notification providers in ADR-003 are unchanged.

## Rationale

Removes Iran-specific operational dependency from the global pivot while preserving a narrow compatibility window for old clients.
