# Instagram seller composer (@pooli)

Pooli uses **one** Instagram Professional account (`@pooli`) as a seller-only composer bot. `@pooli` never messages the buyer. The seller pastes `https://pooli.shop/p/{slug}` into the buyer’s Instagram DM.

Instagram Messaging API has **no per-message fee**. Do not assume WhatsApp-style pricing.

A Facebook Page is **not** required. Use Instagram Login (`graph.instagram.com`).

## Human steps (do these in Meta, not in git)

1. Convert `@pooli` to a Professional account (Business preferred).
2. [Meta Developers](https://developers.facebook.com/apps/) → My Apps → Create app → use case that includes Instagram / manage messages.
3. App name **Pooli** (this is the API app name, not the IG handle).
4. Add product **Instagram** → API setup with **Instagram login**.
5. Request permissions:
   - `instagram_business_basic`
   - `instagram_business_manage_messages`
6. Webhook callback URL (same public path as Telegram):

   `https://pooli.shop/api/v1/integrations/instagram/webhook`

   Direct API host `https://api.pooli.shop/api/v1/integrations/instagram/webhook` also reaches the Go service. Prefer `pooli.shop` so it matches the live Telegram webhook.
7. Verify token = `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` (you generate this; put the same value in VPS env).
8. Subscribe fields: `messages`, `messaging_postbacks`.
9. On the VPS (same place as `TELEGRAM_BOT_TOKEN`), set:

   ```
   INSTAGRAM_ENABLED=true
   INSTAGRAM_ACCESS_TOKEN=<from Meta>
   INSTAGRAM_IG_USER_ID=<@pooli professional IGSID>
   INSTAGRAM_WEBHOOK_VERIFY_TOKEN=<same as step 7>
   INSTAGRAM_APP_SECRET=<app secret>
   INSTAGRAM_GRAPH_BASE=https://graph.instagram.com
   INSTAGRAM_GRAPH_VERSION=v21.0
   ```

   Restart the API. **Never commit secrets.**
10. Until App Review, only Meta testers / added IG accounts can talk to the bot. Settings UI shows this as testers-only.
11. Optional Ice Breakers (do not block launch; they do not show on desktop IG):

    ```bash
    INSTAGRAM_ACCESS_TOKEN=… INSTAGRAM_IG_USER_ID=… ./scripts/instagram-ice-breakers.sh
    ```

    Or, as an admin session: `POST /api/v1/admin/instagram/ice-breakers`.

## Seller bind

1. Log in to Pooli → Settings → Notifications.
2. Get a one-time code (`pooli-XXXX`).
3. From the **real shop Instagram account**, DM `@pooli` that code.
4. After bind, send `پرداخت` / `pay` → amount in toman → `بله` / `تأیید`.
5. Copy the reply (`https://pooli.shop/p/{slug}`) into the buyer’s DM.

Typed Instagram usernames in the PWA are not identity. Only the one-time code from the real account binds.

## Safe defaults

With `INSTAGRAM_ENABLED=false` or an empty token: the app boots, GET webhook can still complete Meta’s challenge if the verify token is set, POST is a 200 no-op, and Settings shows “not enabled on this server yet.”
