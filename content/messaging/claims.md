# Claims register

Checked 15 Aug 2026 against:

- Local + `origin/main` SHA `ac9356dd407f163915d80c94f9cdd7808852cd70`
- Live `GET https://pooli.shop/api/v1/ops/status` (same SHA)
- VPS containers `pooli-api`, `pooli-web`, `pooli-chain-worker`, `pooli-postgres` (healthy / up)
- Code in `internal/config`, `docs/`, `apps/web`

The 15 Aug canvas (`pooli-analysis.canvas.tsx`) described **repo defaults**, not live flags. Treat it as stale on BSC checkout, Telegram, and email.

Never print secrets. Ops status is the public source for ENABLED.

## How to read this

A feature can be IMPLEMENTED and still PLANNED for customers. ENABLED is not the same as “thousands of people use it.”

**PROVEN** here never includes volume, GMV, merchant names, or “production payments at scale.”

---

## The job (say this)

| Claim | Class | Notes |
|-------|-------|--------|
| Turn a DM order into a checkout link | IMPLEMENTED + DEPLOYED | Merchant creates an order, shares `/p/{slug}` |
| Send a link. Know when they paid. | DEPLOYED | Live landing copy on pooli.shop |
| Seller quotes in toman; buyer pays exact USDT | IMPLEMENTED + ENABLED | Money model in architecture + checkout |
| Money goes to the seller’s wallet. Pooli does not hold it. | IMPLEMENTED | Non-custodial; no private keys stored |
| Only the server can mark Paid ✓ | IMPLEMENTED | Browser cannot set PAID |
| Unique payable amount per active reservation | IMPLEMENTED | Matcher; approximate amounts never auto-settle |
| Waiting → Detected → Confirming → Paid ✓ | IMPLEMENTED | Merchant/buyer language |
| Buyer does not install an app | IMPLEMENTED | Public checkout page |
| EN + FA, RTL | IMPLEMENTED + DEPLOYED | PWA + landing |
| Domain pooli.shop | PROVEN | Live site fetched |

## Rails

| Claim | Class | Notes |
|-------|-------|--------|
| TRON (TRC-20 USDT) checkout | ENABLED | `tron_network=mainnet`; watcher cursor healthy |
| BNB Smart Chain (BEP-20 USDT) checkout | ENABLED | `enable_bsc_checkout=true`; `checkout_networks: tron, bsc`; watcher healthy. Morning canvas said gated — **wrong as of this check**. |
| “We support every chain / every token” | DO NOT CLAIM | USDT on TRON + BSC only |
| TRON matching “proven on mainnet” | PROVEN (technical) | ADR-007. Means the matcher has been exercised — **not** a GMV claim |
| “BSC payments are battle-tested at scale” | DO NOT CLAIM | Watcher is healthy; no public volume |
| Chain simulator off in production | ENABLED | `enable_chain_simulator=false` |
| Live USDT/toman quotes | ENABLED | Configured `nobitex`, last quote source `wallex` (Nobitex DNS currently dark; documented). Fail-closed; no silent mock. |
| “Best rate in Iran” / a specific number | DO NOT CLAIM | Rate moves; do not freeze a number in ads |

## Auth

| Claim | Class | Notes |
|-------|-------|--------|
| Google sign-in | ENABLED | `google_oauth_enabled=true` |
| Phone OTP for production login | DO NOT CLAIM | `otp_sms_provider=mock`; `phone_otp_enabled=false`. Production rejects mock OTP. |
| “Sign in with phone” as a live path | DO NOT CLAIM | Code exists for local/CI mock only |

## Notifications

| Claim | Class | Notes |
|-------|-------|--------|
| Telegram merchant bot @PooliShopbot | ENABLED | `telegram_enabled=true`. Connect in Settings. Paid / needs-review messages. |
| Telegram Mini App (create + buyer wrap) | IMPLEMENTED + ENABLED (bot is on) | Routes `/t/app`, `/t/p/{slug}`. Do not claim “every seller uses the Mini App.” |
| Instagram seller composer (@pooli DMs) | IMPLEMENTED / PLANNED | `instagram_enabled=false`. Code + docs exist. Meta App Review still in the way. **Do not say you can create payments from Instagram today.** |
| Email payment notifications | ENABLED | Resend; `notifications@notify.pooli.shop`; reply `support@pooli.shop` |
| “We text you when paid” | DO NOT CLAIM | No production SMS |

## Checkout / wallets

| Claim | Class | Notes |
|-------|-------|--------|
| Pay by copying the address / QR | IMPLEMENTED | Always available |
| TRON: TronLink / `tron:` deeplink + QR | IMPLEMENTED | |
| BNB Chain: WalletConnect pay-with-wallet | IMPLEMENTED | In web handoff. Production project id is build-time; do not claim “every wallet, every time.” |
| “Works with all wallets” | DO NOT CLAIM | Compatible wallets only; QR/copy is the reliable fallback |
| Reusable payment links | IMPLEMENTED | Settings → Getting paid |
| Public store page | IMPLEMENTED | `pooli.shop/{store-slug}` |
| Customers list + notes/tags | IMPLEMENTED | Not a CRM. No returning-buyer autofill. |
| Fulfillment states (unfulfilled → shipped) | IMPLEMENTED | Separate from payment status |

## What we are not

| Claim | Class |
|-------|--------|
| Wallet / exchange / custody / off-ramp | DO NOT CLAIM (we are none of these) |
| Fiat settlement, card acquiring, shetab | DO NOT CLAIM |
| Swaps, multi-token, yield | DO NOT CLAIM |
| Instant cash-out to rial | DO NOT CLAIM |
| “Trusted by thousands” / named merchants / GMV | DO NOT CLAIM |
| Investors, raise, valuation, TAM charts with fake numbers | DO NOT CLAIM |
| Registered legal entity name, company number, HQ city | DO NOT CLAIM until filled in [media-kit](../media-kit/README.md) |
| Testimonials | DO NOT CLAIM |

## Infrastructure (say only to technical people)

| Claim | Class | Notes |
|-------|-------|--------|
| Next.js PWA + Go API + chain-worker + Postgres | IMPLEMENTED + DEPLOYED | |
| Redis unused | IMPLEMENTED | In Compose; Go services do not use it |
| Realtime is process-local SSE | IMPLEMENTED | Second API instance would miss events. Do not advertise “realtime infrastructure.” |
| Single-host Docker Compose | DEPLOYED | Honest if asked; not a headline |
| Notion Product OS | Snapshot | Planning layer only. Not behavior truth. |

## Screenshot / demo rules

- Demo merchant in existing studio work: **تهران اسنیکرز** — synthetic, labeled, not a customer.
- Never use production PII, real phones, real addresses, real tx from strangers.
- Status words must match the product: Paid ✓ / Waiting for payment / Needs attention / Payment detected.

## Safe public sentences (copy these)

1. Send a link. Know when they paid.
2. Create a payment, share it, and see Paid ✓ — without chasing receipts.
3. The money goes to your wallet. Pooli never holds it.
4. Your customer opens a page. They pay. You see Paid ✓.
5. Built for people who sell in DMs.

## Sentences that look true and are not (yet)

1. “Create the link inside Instagram.” — PLANNED (flag off).
2. “Text us / SMS login.” — mock only.
3. “Pay on any network.” — two networks, USDT only.
4. “Live in production with paying merchants.” — site is live; volume is unpublished. Say the site is live. Do not imply a book of business.
