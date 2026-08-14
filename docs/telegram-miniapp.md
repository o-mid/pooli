# Telegram Mini App

The existing notify + `t.me/{bot}?start={token}` connect flow stays. The Mini App is additive.

Buyer checkout (no auth): `https://pooli.shop/t/p/{slug}`  
Seller create: `https://pooli.shop/t/app` and `https://pooli.shop/t/app/create`

Domain must be HTTPS `pooli.shop` (already).

## Menu button

Point the bot menu at the seller Mini App:

```bash
TELEGRAM_BOT_TOKEN=… ./scripts/telegram-set-menu-button.sh
```

Or in BotFather: `/setmenubutton` → URL `https://pooli.shop/t/app` → text `Open Pooli`.

Equivalent API: `setChatMenuButton` with `type=web_app`.

## initData

Mutating Mini App requests send the **raw** `Telegram.WebApp.initData` query string in `X-Telegram-Init-Data`.

Server validation (see `internal/auth/telegram_initdata.go`):

1. `secret_key = HMAC_SHA256(key="WebAppData", data=bot_token)`
2. `data_check_string` = sorted `key=value` lines **excluding** `hash`, joined by `\n`
3. `check_hash = hex(HMAC_SHA256(key=secret_key, data=data_check_string))`
4. Reject on hash mismatch, `auth_date` older than 10 minutes, or missing `user`

Do not reserialize JSON. Map `user.id` → `telegram_connections.telegram_user_id` where `enabled=true`. Unconnected users cannot create orders and are not auto-registered as merchants.

`POST /api/v1/integrations/telegram/miniapp/orders` returns `{ slug, checkout_url (/p/{slug}), telegram_checkout_url (/t/p/{slug}) }`.

Buyer `/t/p/{slug}` uses the public pay API and does **not** send initData.

## Keep the existing webhook

`POST /api/v1/integrations/telegram/webhook` still requires `X-Telegram-Bot-Api-Secret-Token`. Register it as before (`docs/external-services-setup.md`). Mini App create does not replace `/start` connect.
