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
```

Local Nile defaults stay in `.env.example` for development.

## Steps

1. `docker compose up -d && go run ./cmd/migrate up`
2. Start API and chain-worker with the mainnet env above.
3. Register merchant, add a **mainnet TRON** wallet you control (as receiving address).
4. Create a small order (exact payable USDT will include a tiny reference suffix).
5. Open checkout on a phone, select TRON, send **exactly** the shown USDT amount from an external wallet.
6. Wait for confirmations; buyer + merchant screens should move SEEN → CONFIRMING → PAID without refresh.

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
| UI stale | Polling only while awaiting; hard-refresh once to confirm DB PAID |
| Simulator accidents | `ENABLE_CHAIN_SIMULATOR` must be false |

## Evidence to keep

- Tronscan transaction URL
- `payment_intents.status=PAID`
- `amount_reservations.status=consumed`
- `payment_options.status=SETTLED`
- Screenshot or note that buyer + merchant UIs showed PAID without manual refresh
