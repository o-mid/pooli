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

## 5. WalletConnect (build-time web config)

WalletConnect is used for EVM “Pay with wallet” handoff (`@walletconnect/ethereum-provider`).
TRON checkout does not require it.

### Why build-time

`NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is a Next.js public env var. It is **inlined into the
client bundle during `next build`**. Setting it only on a running container has no effect.

Production web image build (`deploy/hostinger/Dockerfile.web` + `docker-compose.yml`) passes:

```
NEXT_PUBLIC_SITE_URL=https://pooli.shop
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=<from deploy/hostinger/.env>
```

### Host setup (do not commit the value)

On the VPS, in `/opt/pooli/deploy/hostinger/.env` (gitignored):

```
NEXT_PUBLIC_SITE_URL=https://pooli.shop
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=<Cloud project id>
```

Then rebuild **web** (API rebuild alone is not enough):

```bash
cd /opt/pooli/deploy/hostinger
docker compose build pooli-web
docker compose up -d pooli-web
```

Or run `./scripts/deploy-hostinger.sh` from a clean local tree (rsync excludes `.env`, so the
host file is preserved).

### Domain allowlist

In WalletConnect Cloud, allow only:

- `https://pooli.shop`

Do not add wildcards or unrelated origins.

### Graceful missing ID

If the project id is absent at build time:

- EVM WalletConnect / Trust wallet rows are omitted from the handoff plan
- Checkout falls back to QR / copy / EIP-681
- No WalletConnect SDK init runs

### BSC checkout gate (still separate)

WalletConnect config alone does **not** enable BNB Chain checkout.

Keep until the BSC watcher/RPC/payment path is production-ready:

```
ENABLE_BSC_CHECKOUT=false
ENABLE_BSC_WATCHER=false
```

Only after WC handoff is verified on a real device **and** BSC verification is ready:

1. Confirm `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` was baked into the web bundle
2. Set `ENABLE_BSC_WATCHER=true` with a solid RPC
3. Then set `ENABLE_BSC_CHECKOUT=true`

## 6. TRON PAID proof on current revision

```bash
./scripts/tron-mainnet-proof-checklist.sh
```

Record evidence in [`tron-mainnet-pilot.md`](./tron-mainnet-pilot.md).
