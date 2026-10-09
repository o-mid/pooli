# Pooli monitoring & alerting

Lightweight ops stack — no Prometheus/Grafana required for V1.

## Endpoints

| Check | URL | Expect |
|-------|-----|--------|
| Liveness | `GET /healthz` | `200` `{ok:true}` |
| Ops status | `GET /api/v1/ops/status` | `200` in healthy prod; `503` if worker stale / mock rates / simulator |

Ops status never returns API keys. It includes:

- worker heartbeat + watcher cursors
- `checkout_networks_effective` (flag and cursor health)
- unacknowledged `watcher_gaps`
- rate quote age / last source
- notification failure counts
- stuck confirming / needs-review counts
- `alerts[]` string codes for external monitors to scrape

## External uptime (Omid creates account)

Point a free uptime service (UptimeRobot, Healthchecks.io, or Better Stack) at:

1. `https://api.pooli.shop/healthz` — every 1–5 minutes
2. `https://api.pooli.shop/api/v1/ops/status` — every 5 minutes; alert on non-200

## Alert codes in `ops/status`

| Code | Meaning |
|------|---------|
| `chain_worker_heartbeat_stale` | Worker has not beat within `WORKER_HEARTBEAT_STALE_SECONDS` |
| `rate_quote_stale` | Last `exchange_rate_quotes` row older than 10 minutes |
| `payments_stuck_confirming` | Intent in `CONFIRMING` > 30 minutes |
| `needs_review_elevated` | >10 exception intents open |
| `notification_failures_elevated` | >20 failed deliveries in 24h |
| `watcher_cursor_stale` | A watcher cursor is older than `WATCHER_STALE_SECONDS` (default 600), or the cursor read failed |
| `watcher_gap_unacknowledged` | A `watcher_gaps` row has no `acknowledged_at`. Checkout for that network stays hidden |
| `watcher_health_unknown` | Cursor or gap query failed. BSC checkout is withheld |

`checkout_networks_effective` is the list buyers can select. It drops BSC when `ENABLE_BSC_CHECKOUT` is false, when that cursor is stale, or when BSC has an open gap. TRON follows the same cursor and gap rule.

A cursor snap (`BSC_ALLOW_CURSOR_SNAP`, default false) writes `watcher_gaps`. Acknowledge with `POST /api/v1/admin/watcher-gaps/acknowledge` after the gap audit. See `docs/runbooks/bsc-gap-audit.md`.

## Optional Sentry

Set on API / worker / web when ready (do not commit DSN):

```
SENTRY_DSN=
```

Sentry is optional; healthz + ops/status + uptime cover the V1 bar.

## Admin investigation

Authenticated admin (`ADMIN_EMAILS`):

- `GET /api/v1/admin/search?q=`
- `GET /api/v1/admin/payment-intents/{id}/timeline`
- `GET /api/v1/admin/exceptions`
- `GET /api/v1/admin/notification-deliveries`
- `POST /api/v1/admin/notification-deliveries/{id}/retry` (failed/pending only)

**Manual PAID is forbidden.** Resolve actions may set `NEEDS_REVIEW` or record audit notes only. Chain matcher remains the only path to `PAID`.
