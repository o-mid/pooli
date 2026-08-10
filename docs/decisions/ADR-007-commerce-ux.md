# ADR-007: Commerce UX domain (customers, fulfillment, defaults)

## Context

MVP payment matching is proven on TRON mainnet. Sellers need a lightweight social-commerce operating loop (DM → Quick Pay → share → PAID → ship) without changing non-custodial settlement.

## Decisions

1. **Payment vs fulfillment:** Payment intent status remains the financial source of truth. Orders gain an independent `fulfillment_status` (`UNFULFILLED` → `PROCESSING` → `SHIPPED` → `DELIVERED` / `CANCELLED`). UI shows both; never merge into one status field.
2. **Merchant checkout defaults:** Stored in `merchant_checkout_defaults`. Creating an order snapshots field definitions onto `order_field_definitions`. Changing defaults never mutates existing orders.
3. **Customers:** Merchant-scoped records upserted from submitted checkout fields (normalized phone/email when possible). Isolation enforced on every read. Not a CRM.
4. **Returning buyer address reuse:** Deferred. Do not disclose saved addresses based solely on typed phone/email. Requires an explicit verification step in a later sprint.
5. **Timeline:** `order_timeline_events` is authoritative. Payment transitions write via `payment.RecordPaymentTimeline`; fulfillment/merchant/buyer actions write at the handler.
6. **Receipts:** Built only from verified backend payment + matched chain data. Never from browser-submitted tx hashes.
7. **Open Graph:** Public `/p/{slug}` metadata includes merchant name, order title, logo, Pooli branding. Excludes amount, customer name, phone, address, and private notes.
8. **Wallets:** Soft-archive (`is_active=false`) only. Block disable/archive while active payment intents reference the destination. Existing payment destinations remain immutable.

## Non-goals (this sprint)

Live rate providers, custody, withdrawals, new chains/tokens, postal APIs, inventory/catalog, buyer account registration, insecure returning-customer autofill.
