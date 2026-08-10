# External services setup (Rates + Telegram)

Do **not** commit secrets. Install them only on the host (Hostinger env, systemd, etc.).

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

This sprint does **not** change production Hostinger env for you. Apply the vars manually, then restart API.

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

### Merchant flow

1. Settings → Notifications → Connect Telegram  
2. Opens `https://t.me/PooliShopbot?start=<one-time-token>`  
3. Bot `/start` webhook binds `chat_id` to merchant  
4. Send test / Disconnect from settings  

Notifications (idempotent):

- `payment.paid` — commerce-first paid message  
- `payment.needs_review` — under/over/late/review attention  

Telegram failures never change payment status.
