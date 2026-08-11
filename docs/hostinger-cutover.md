# Hostinger cutover + SSH audit (manual)

This complements [`external-services-setup.md`](./external-services-setup.md).

## 1. Restore SSH from your laptop

Host `pooli.shop` resolves to `195.110.58.84`. From the audit machine, SSH currently fails with `Permission denied (publickey,password)`.

1. In Hostinger hPanel → VPS → SSH access, authorize your public key (`~/.ssh/id_ed25519_rotated_20260811.pub` or a new key).
2. Add a `~/.ssh/config` Host entry (example):

```
Host pooli-vps
  HostName 195.110.58.84
  User root
  IdentityFile ~/.ssh/id_ed25519_rotated_20260811
  IdentitiesOnly yes
```

3. Verify: `ssh pooli-vps 'hostname && whoami'`

## 2. Read-only audit (no changes)

```bash
POOLI_SSH=pooli-vps ./scripts/hostinger-readonly-audit.sh
# or: POOLI_SSH=root@195.110.58.84 POOLI_SSH_IDENTITY=~/.ssh/… ./scripts/hostinger-readonly-audit.sh
```

Confirm:

- Deployed git SHA / image
- `RATE_PROVIDER=nobitex` (never `mock` in production)
- `ENABLE_CHAIN_SIMULATOR=false`
- Telegram / BSC / Google keys present as expected (script prints set/empty only)
- `curl http://127.0.0.1:8180/api/v1/ops/status` shows worker OK

## 3. Apply live rates (if still mock)

On the VPS, edit `deploy/hostinger/.env` (never commit):

```
APP_ENV=production
RATE_PROVIDER=nobitex
RATE_FALLBACK_PROVIDER=wallex
RATE_POLICY=best_buy
RATE_CACHE_SECONDS=20
RATE_MAX_AGE_SECONDS=60
RATE_PROVIDER_TIMEOUT_SECONDS=5
RATE_STALE_SECONDS=180
ENABLE_CHAIN_SIMULATOR=false
ENABLE_BSC_CHECKOUT=false
OTP_SMS_PROVIDER=mock
```

Then rebuild/restart API + worker (example):

```bash
cd /path/to/pooli/deploy/hostinger
docker compose up -d --build pooli-api pooli-chain-worker
docker compose run --rm pooli-migrate   # if migration 000007 not applied
```

Public check after deploy:

```bash
curl -sS https://api.pooli.shop/api/v1/ops/status | jq '.config.rate_provider,.worker.ok,.ok'
```

Expect `rate_provider` = `nobitex` and `worker.ok` = true.

## 4. Telegram (optional for first pilot)

See [`external-services-setup.md`](./external-services-setup.md). Rotate token if ever leaked. Set webhook yourself. Do not paste tokens into chat.

## 5. WalletConnect (required before BSC checkout)

1. Create a project at https://cloud.walletconnect.com
2. Set `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` on the **web** build args
3. Only then set `ENABLE_BSC_CHECKOUT=true` and `ENABLE_BSC_WATCHER=true` with a solid RPC

## 6. TRON PAID proof on current revision

```bash
./scripts/tron-mainnet-proof-checklist.sh
```

Record evidence in [`tron-mainnet-pilot.md`](./tron-mainnet-pilot.md).
