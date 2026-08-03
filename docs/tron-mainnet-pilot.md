# TRON mainnet pilot runbook

Goal: a real USDT-TRC20 transfer from an external wallet reaches Pooli automatically after confirmation depth, survives worker restart, and both UIs show PAID without manual refresh.

## Environment

```bash
APP_ENV=production
ENABLE_CHAIN_SIMULATOR=false
ENABLE_BSC_WATCHER=false

TRON_NETWORK=mainnet
TRONGRID_BASE_URL=https://api.trongrid.io
TRONGRID_API_KEY=<your key>
TRON_USDT_CONTRACT=TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
TRON_CONFIRMATIONS=20
TRON_EXPLORER_TX_URL=https://tronscan.org/#/transaction/%s

# Pilot override (product default remains QUOTE_TTL_SECONDS=600):
QUOTE_TTL_SECONDS=1800
LATE_PAYMENT_RECONCILE_WINDOW_SECONDS=7200
```

Local Nile defaults stay in `.env.example` for development.

### TTL notes

- `QUOTE_TTL_SECONDS` is both quote TTL and reservation TTL (one shared `expires_at`).
- Product default is **600s (10 minutes)**.
- Mainnet operator tests should use **1800s (30 minutes)** so external-wallet sends are unlikely to miss the active window.
- Exact payments after reservation release, within `LATE_PAYMENT_RECONCILE_WINDOW_SECONDS` (default 2h), become `LATE_PAYMENT` (matched, reviewable, **not** auto-settled).

## Steps

1. `docker compose up -d && go run ./cmd/migrate up`
2. Start API and chain-worker with the mainnet env above (restart after changing TTL).
3. Register merchant, add a **mainnet TRON** wallet you control (as receiving address).
4. Create a small order (exact payable USDT will include a tiny reference suffix).
5. Confirm checkout `expires_at` still has ample time before sending.
6. Open checkout on a phone, select TRON, send **exactly** the shown USDT amount from an external wallet.
7. Wait for confirmations; buyer + merchant screens should move SEEN → CONFIRMING → PAID without refresh.

## Worker restart recovery gate

1. Create checkout and note the exact payable amount.
2. **Stop** the chain-worker.
3. Send the USDT transfer.
4. Start the chain-worker again.
5. Expect backfill via timestamp overlap + `event_id` dedupe → status reaches PAID.

## Failure triage

| Symptom | Check |
|--------|--------|
| Never detected | TronGrid key/rate limits; wallet address; USDT contract; worker logs |
| Stuck SEEN | Confirmation tip API; `TRON_CONFIRMATIONS`; `block_number` on `chain_events` |
| Wrong amount | Unique payable amount mismatch (under/over → needs review) |
| Paid after expiry | Intent `LATE_PAYMENT` + `matched_transactions.match_type=LATE_PAYMENT`; admin unmatched if ambiguous/outside window |
| Order stuck `AWAITING_PAYMENT` while intent `EXPIRED` | Worker `expireIntents` should sync order → `EXPIRED` from linked intent |
| UI stale | Polling only while awaiting; hard-refresh once to confirm DB PAID |
| Simulator accidents | `ENABLE_CHAIN_SIMULATOR` must be false |

## Evidence to keep

- Tronscan transaction URL
- `payment_intents.status=PAID`
- `amount_reservations.status=consumed`
- `payment_options.status=SETTLED`
- Screenshot or note that buyer + merchant UIs showed PAID without manual refresh

## Phase 3 first real-mainnet verification record

Correct merchant payment TxID:

`bc8512d726382aa93eeef96b22b87a821a3b9ab2aea503e7b797c6bc44155fa4`

| Layer | Result | Notes |
|-------|--------|--------|
| Blockchain transfer | **PASS** | 0.396827 USDT to merchant wallet; block 85199246 @ 2026-08-09 09:45:06 UTC |
| TRON watcher | **PASS** | Natural ingest into `chain_events` with correct amount/address/contract/block; `event_id` deduped |
| Lifecycle settlement | **FAIL** | Checkout expired ~09:40:20 UTC; reservation released before payment; matcher ignored released exact match (pre-fix) |
| Chain connectivity | **PASS** | No Pooli↔TronGrid failure |

An earlier hash (`dc007403…`) was a **user copy error** (unrelated transfer), not a Pooli defect.

Post-fix expected behavior for the same scenario: intent → `LATE_PAYMENT`, matched tx persisted, no auto-settle / usage / option SETTLED.
