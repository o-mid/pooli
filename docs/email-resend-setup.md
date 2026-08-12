# Transactional email (Resend)

Human/business mail stays on your domain mailbox:

- `support@pooli.shop` — customer support, merchant support, human replies

Automated Pooli mail uses Resend only:

- From: `Pooli <notifications@notify.pooli.shop>`
- Reply-To: `support@pooli.shop`

Do **not** change root-domain MX / SPF-DKIM for the human support mailbox.
Do **not** enable Resend receiving for support mail.
Do **not** commit `RESEND_API_KEY`.

## Architecture

```
Domain event (after matcher commit)
  ├── Telegram channel
  └── Email channel → EmailProvider → Resend
```

Payment settlement never waits on email. A Resend outage must not block `PAID`.

Idempotency reuses `notification_deliveries` with `channel=email` and event keys:

- `payment.paid:{intentID}:merchant`
- `payment.paid:{intentID}:buyer`
- `payment.needs_review:{intentID}:merchant`
- `fulfillment.{status}:{orderID}:buyer`

## Local / CI

```
EMAIL_ENABLED=true
EMAIL_PROVIDER=fake
```

`fake` records sends in-process and is **forbidden** when `APP_ENV=production`.

## Production cutover (manual)

1. Confirm Resend domain `notify.pooli.shop` status is **Verified** (not pending).
2. Generate a **new** API key in Resend (revoke any previously exposed key).
3. On the server (`deploy/hostinger/.env`, gitignored), set:

```
EMAIL_ENABLED=true
EMAIL_PROVIDER=resend
RESEND_API_KEY=<secret — set on host only>
EMAIL_FROM_NAME=Pooli
EMAIL_FROM_ADDRESS=notifications@notify.pooli.shop
EMAIL_REPLY_TO=support@pooli.shop
```

4. Restart API + chain-worker.
5. Smoke: paid order → merchant email + optional buyer receipt.
6. Ops JSON (`/api/v1/ops/status`) shows `email_enabled` / `email_from_address` with **no** API key.

If the domain is still pending, keep `EMAIL_ENABLED=false`.

## Implemented messages

| Message | Recipient | Trigger |
|---|---|---|
| Payment received | Merchant owner email | `payment.paid` + pref on |
| Payment receipt | Buyer email (if present) | `payment.paid` |
| Needs attention | Merchant | `payment.needs_review` + pref on |
| Order update / shipped | Buyer email (if present) | fulfillment `SHIPPED`/`DELIVERED` + pref on |

## Auth email (not in this sprint)

Pooli has email/password + Google OAuth + phone OTP. There is **no** password-reset, magic-link, or email-verification sender today. Connect those later via the same `email.Provider` if product needs them.

## Resend webhooks (follow-up)

Delivery webhooks (`email.delivered`, `email.bounced`, …) use Svix signatures (`svix-id`, `svix-timestamp`, `svix-signature`). Deferred to a later sprint so we can add `RESEND_WEBHOOK_SECRET`, raw-body verification, and status updates without expanding this change.
