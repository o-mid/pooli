# BSC gap audit

The BSC watcher cursor was last known stale on 2026-08-20. On 2026-10-09 a deploy (`572a071`) started skipping a large lag instead of walking it. A fresh cursor after that deploy does **not** mean those blocks were scanned.

Status of this audit: **not yet run.**

Do not turn on `BSC_ALLOW_CURSOR_SNAP`, and do not deploy a new chain-worker, until the tables below are filled and any hit has been resolved.

## 1. Read-only SQL

From the repo:

```bash
scripts/bsc-gap-audit.sh
```

That prints three queries. They list:

- every `payment_options` / `payment_intents` row on network `bsc` created since 2026-08-20, with status, destination, `pay_amount`, `expires_at`, and merchant
- every distinct destination address on those options
- `chain_events` / `matched_transactions` on BSC since the same date

To run them yourself (still read-only):

```bash
DATABASE_URL='postgres://…' scripts/bsc-gap-audit.sh --run
```

Use a role that cannot write. Do not edit rows from `psql`.

## 2. Addresses to check

Copy the distinct addresses from query 2 into this table before opening an explorer.

| Address | Explorer checked | Incoming BEP-20 USDT since 2026-08-20 |
| --- | --- | --- |
| | | |

## 3. Explorer check

For each address, open a BscScan-style token transfer page for Binance-Peg USDT (`0x55d398326f99059fF775485246999027B3197955`) and list incoming transfers since 2026-08-20.

| Address | Tx hash | Amount | Time (UTC) | Matching option, or "none" |
| --- | --- | --- | --- | --- |
| | | | | |

"None" means the transfer does not match a `pay_amount` on an option for that address in the SQL result.

## 4. Resolve a hit

Use the admin resolve route. Do not update `payment_intents` by hand.

`POST /api/v1/admin/resolve`

```json
{
  "payment_intent_id": "<intent uuid>",
  "action": "needs_review",
  "reason": "BSC gap audit: incoming USDT during unwatched window",
  "event_id": "<chain event id if one was ingested>"
}
```

`mark_paid` is rejected. Only the matcher can set Paid.

If the transfer was never ingested, leave the intent in review and record the tx hash in the reason. Re-scanning the skipped blocks is a separate decision after this table is complete.

## 5. After the audit

An open `watcher_gaps` row keeps BSC checkout hidden and the watcher `ok: false` until:

`POST /api/v1/admin/watcher-gaps/acknowledge`

```json
{ "network": "bsc", "reason": "gap audit completed, no unresolved incoming USDT" }
```
