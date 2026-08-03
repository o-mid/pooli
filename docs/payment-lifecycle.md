# Payment Lifecycle

## Entities

```
Order → PaymentIntent → PaymentOption(s)
```

## States

`CREATED` → `AWAITING_PAYMENT` → `SEEN` → `CONFIRMING` → `PAID`

Exception states: `EXPIRED`, `UNDERPAID`, `OVERPAID`, `LATE_PAYMENT`, `NEEDS_REVIEW`, `DUPLICATE_PAYMENT`

## Transitions

1. Order created with fiat TMN amount and checkout field definitions.
2. Payment intent created; rate quote persisted; unique amounts reserved per network option.
3. Buyer submits customer details and selects a network.
4. Worker observes chain transfer events for watched merchant addresses.
5. Event normalized → verified (network, token allowlist, destination, amount) → matched.
6. Exact match moves through SEEN/CONFIRMING/PAID once confirmation policy is met.
7. Non-exact or ambiguous matches become review/exception states; never silent approximate settlement.
8. Exact transfer after reservation release, inside `LATE_PAYMENT_RECONCILE_WINDOW_SECONDS` (default 2h), links to the expired intent as `LATE_PAYMENT` with a matched transaction for merchant review — **no auto-settle**. Outside the window, or when multiple released exact candidates exist, the event stays unmatched for operator review.

## TTL

`QUOTE_TTL_SECONDS` (default 600) sets a single shared `expires_at` on the payment intent, payment option, and amount reservation. There is no separate reservation TTL.

## Idempotency

`chain_events.event_id` is unique. Replayed provider events are ignored after first ingest.
