# Turn off BSC checkout

Buyers must not be offered BNB Chain while the BSC watcher is stale or has an unacknowledged gap. The API now hides it on its own. This runbook is the manual switch if you want the flag off as well.

## Observed production state

Fetched `GET https://api.pooli.shop/api/v1/ops/status` on 2026-10-09T13:36:47Z (git `572a071`):

- `enable_bsc_checkout`: true
- `checkout_networks`: tron, bsc
- BSC cursor `updated_at`: 2026-10-09T13:36:45Z, `age_seconds` about 1.5, `ok`: true
- TRON cursor fresh, worker heartbeat ok, `poll_errors`: 0

`572a071` is the deploy that skips a large BSC lag instead of walking it. A fresh cursor after that deploy does not prove blocks since 2026-08-20 were scanned. The gap audit in [bsc-gap-audit.md](./bsc-gap-audit.md) is **not yet run**. Nothing in this session changed the VPS.

## Change

On the server, in `/opt/pooli/deploy/hostinger/.env`:

```
ENABLE_BSC_CHECKOUT=false
```

Leave `ENABLE_BSC_WATCHER` as it is unless you also want the poll to stop. Checkout follows the flag and cursor health either way.

Restart only the API so it re-reads env. From `/opt/pooli/deploy/hostinger`:

```bash
docker compose up -d --force-recreate --no-deps pooli-api
```

Do not run `deploy-chain-worker.sh` for this switch. That rebuilds the worker. Do not deploy a new worker until the gap audit is done.

## Verify

On the server:

```bash
curl -fsS http://127.0.0.1:8180/api/v1/ops/status
```

Expect `config.enable_bsc_checkout` false and `checkout_networks` / `checkout_networks_effective` to list `tron` only (once this build is what the API is running).

Public check:

```bash
curl -fsS https://api.pooli.shop/api/v1/ops/status
```

## Not done from here

This file does not apply the change. Ask before running anything on the VPS.
