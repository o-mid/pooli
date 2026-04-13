# Implementation Plan

See ADRs in `docs/decisions/`.

## Milestones

0. Repository scaffold, Compose, and docs
1. Merchant/order product and public checkout
2. Rate engine, payment intents, and unique amount reservations
3. EVM/BSC adapter
4. TRON adapter
5. Checkout polish
6. Telegram notifications and admin reconciliation
7. Hardening tests and CI

## Assumptions

- Unique-amount matching is sufficient for V1 social-commerce volumes.
- Mock rate provider is acceptable for local demo; Nobitex/Wallex for staging/prod.
- Railway is the initial deployment target.
