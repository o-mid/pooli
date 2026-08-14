# External services setup (Rates + Telegram)

Do **not** commit secrets. Install them only in your server environment file (`deploy/hostinger/.env`, gitignored).

## Security: rotate leaked Telegram token

If a BotFather token was ever pasted into chat or committed anywhere, **revoke/regenerate it in BotFather** before production use. The previous token must be treated as compromised.

## Live USDT / Toman rates

### Local / CI (default)

```
RATE_PROVIDER=mock
MOCK_USDT_TMN_RATE=126000
```

Mock is **forbidden** when `APP_ENV=production` and `RATE_PROVIDER=mock`.

### Production cutover (manual)

```
APP_ENV=production
RATE_PROVIDER=nobitex
RATE_FALLBACK_PROVIDER=wallex
RATE_POLICY=best_buy
RATE_CACHE_SECONDS=20
RATE_MAX_AGE_SECONDS=60
RATE_PROVIDER_TIMEOUT_SECONDS=5
RATE_STALE_SECONDS=180
```

Behavior:

1. Nobitex public `POST https://api.nobitex.ir/market/stats` → `usdt-rls`
2. Field from `RATE_POLICY` (`best_buy` default; falls back to `latest` in the **same** response if missing)
3. IRR → Toman via single `/10` normalization
4. On Nobitex failure/invalid → Wallex `USDTTMN.lastPrice`
5. Both fail → **no financial quote** (fail closed; never silent mock)

Apply the vars on your server, then restart API and worker. Confirm via `GET /api/v1/ops/status` that `config.rate_provider` is `nobitex` (never `mock` in production).

### Nobitex DNS / Wallex-only

`api.nobitex.ir` currently does not resolve from public resolvers (Cloudflare, Google, Quad9) or from the production host. That is a Nobitex/DNS issue, not a local stub-resolver misconfig.

Production stays `RATE_PROVIDER=nobitex` with `RATE_FALLBACK_PROVIDER=wallex`. Quotes come from Wallex (`last_quote_source=wallex` on `/api/v1/ops/status`). Do not switch the primary to `wallex` unless Nobitex stays dark for a long stretch — the fail-closed fallback is the intended path.

Do not add a hardcoded `/etc/hosts` entry for Nobitex. Re-check `dig +short api.nobitex.ir A` occasionally; when it resolves again, new quotes will prefer Nobitex automatically.

## Telegram merchant bot (@PooliShopbot)

### Env

```
TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=<from BotFather — host secret only>
TELEGRAM_BOT_USERNAME=PooliShopbot
TELEGRAM_WEBHOOK_SECRET=<long random secret you generate>
TELEGRAM_WEBHOOK_BASE_URL=https://pooli.shop
TELEGRAM_CONNECT_TOKEN_TTL_SECONDS=600
PUBLIC_BASE_URL=https://pooli.shop
```

Never put `TELEGRAM_BOT_TOKEN` in the repo, frontend, or logs.

### Register webhook (run yourself when ready)

```bash
curl -sS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H 'Content-Type: application/json' \
  -d "{
    \"url\": \"${TELEGRAM_WEBHOOK_BASE_URL}/api/v1/integrations/telegram/webhook\",
    \"secret_token\": \"${TELEGRAM_WEBHOOK_SECRET}\",
    \"allowed_updates\": [\"message\"]
  }"
```

Do **not** run this from the agent unless explicitly asked.

### Production enablement checklist (Omid)

1. Create a **new** BotFather token (never reuse a leaked token).
2. Generate a long random `TELEGRAM_WEBHOOK_SECRET`.
3. Set env on VPS; restart API.
4. Confirm `GET /api/v1/ops/status` shows `telegram_enabled=true` (no token).
5. Register webhook with the curl above.
6. Merchant Settings → Connect → `/start` in @PooliShopbot → Connected ✓ → Send test.
7. Confirm chat IDs never appear in `/api/v1/me` or the web UI.

### Merchant flow

1. Settings → Notifications → Connect Telegram  
2. Opens `https://t.me/PooliShopbot?start=<one-time-token>`  
3. Bot `/start` webhook binds `chat_id` to merchant  
4. Send test / Disconnect from settings  

Notifications (idempotent):

- `payment.paid` — commerce-first paid message  
- `payment.needs_review` — under/over/late/review attention  

Telegram failures never change payment status.

## Transactional email (Resend)

See [email-resend-setup.md](./email-resend-setup.md).

Keep `EMAIL_ENABLED=false` until `notify.pooli.shop` is Verified. Never put `RESEND_API_KEY` in git. Email failures never change payment status.
