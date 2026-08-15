# Partner deck — slides + speaker notes

**Job:** Show where Pooli plugs into Telegram, Meta, wallets, and agencies.  
**Ask:** An operational yes — intro, review path, or one shop trying one order.  
**Not:** A fundraise. Do not present this as the investor story with a new title.

14 slides. 16:9. Present from `index.html` (← → or click).

Demo merchant in screenshots: **تهران اسنیکرز** — synthetic, labeled, not a customer.

---

## 1 · Title

**On slide**

- Pooli for partners
- We sit in the gap between “I’ll take it” and Paid ✓.
- Operational briefing. Not a fundraise.
- pooli.shop · August 2026

**Notes**

This room is Telegram, Meta, a wallet, or an agency.

Do not open with the investor 30s. Do not mention a raise.

If they ask what Pooli is, one line: a checkout link for people who sell in DMs.

---

## 2 · The gap

**On slide** (mint)

- Your users already sell in chat.
- We give them a link to send and a status they can trust.
- Paid ✓

**Notes**

We do not replace Telegram or Instagram. We replace the receipt chase.

The seller still talks to the buyer in your product. We are the page they send, and the Paid they can believe.

---

## 3 · Where we plug in

**On slide**

Four surfaces:

| Surface | Role |
|---------|------|
| Telegram | Bot + Mini App next to the chat |
| Instagram | Composer is built. Flag is off. |
| Wallets | Buyer pays. QR / copy always there. |
| Agencies | Operator workflow for shops you already run |

**Notes**

Walk the map. Then go surface by surface. Do not promise a surface that is off.

---

## 4 · Telegram — on

**On slide**

- @PooliShopbot is **on**
- Seller connects in Settings
- Paid / needs-review messages
- Mini App routes exist: `/t/app`, `/t/p/{slug}`

**Notes**

`telegram_enabled=true` on production.

Do not claim every seller uses the Mini App. The bot is on. Usage is unpublished.

What we need later: listing / discoverability, and a clean Mini App review path if that is a gate on your side.

---

## 5 · Instagram — built, off

**On slide**

- Composer exists in the repo.
- `instagram_enabled=false`
- Meta App Review is still in the way.
- Today the seller pastes the link into the DM.

**Notes**

Say this out loud. Do not soften it into “Instagram payments.”

We will not turn the story on until the flag is on.

If you can help App Review (permissions, use-case language, a review path) — that is a real ask. See slide 11.

---

## 6 · Wallets & checkout

**On slide**

- Pay by copying the address / QR — always
- TRON: TronLink / `tron:` deeplink + QR
- BNB Chain: WalletConnect pay-with-wallet
- USDT on TRON and BNB Chain. That is the list.

**Notes**

Do not say “works with all wallets.” Compatible wallets only. QR/copy is the reliable fallback.

Do not claim “every wallet, every time.” Production WalletConnect project id is build-time.

Buyer does not need a Pooli account.

---

## 7 · Agencies

**On slide**

How you run one client order:

1. Create the payment in toman
2. Send the link in their chat
3. Money goes to the shop’s wallet
4. You see Paid ✓

You do not become the custodian.

**Notes**

This is an operator workflow, not a white-label pitch we have not built.

Fulfillment states (unfulfilled → shipped) are separate from payment status.

Customers list exists. It is not a CRM. No returning-buyer autofill.

---

## 8 · On vs planned

**On slide**

**Enabled now**

- Site live — pooli.shop
- TRON + BNB Chain checkout
- Telegram bot @PooliShopbot
- Telegram Mini App routes
- Email notifications
- Google sign-in
- QR / copy, TronLink, WalletConnect (BSC)

**Built, not on for customers**

- Instagram seller composer
- Phone OTP (mock only — production rejects it)

**Notes**

IMPLEMENTED is not ENABLED. ENABLED is not “everyone uses it.”

No SMS. No “create the link inside Instagram” today.

---

## 9 · What still happens in your product

**On slide**

- The sale stays in the chat.
- The seller still sends the link.
- We do not take over the thread.
- We mark Paid when the payment is actually there.

**Notes**

This is the honest integration story: we are a page + a status, not a takeover of messaging.

If Instagram turns on later, create-in-DM is the new motion. Until then, paste.

---

## 10 · What the seller sees

**On slide**

Home (new payment) + Paid ✓ closeup  
Caption: Demo · تهران اسنیکرز · not a customer

**Notes**

Show the object they would send, and the status they would trust.

Not a traction slide. Not a case study.

---

## 11 · What we need from you

**On slide**

**Telegram** — keep the bot usable; Mini App review path if you have one; intros to seller communities you already talk to.

**Meta** — help through App Review so the composer can turn on. We will not claim it is on until it is.

**Wallets** — reliable pay-with-wallet on TRON and BNB Chain. QR/copy stays the fallback.

**Agencies** — one shop, one order, to see the flow. We will not write a case study until it is real.

**Notes**

This is the ask slide. Stay specific. Do not ask for “distribution” in the abstract.

Do not invent a partnership we do not have.

---

## 12 · What we will not promise

**On slide**

- Instagram-on
- Phone / SMS login
- Every wallet, every network, every token
- Fiat, cards, Shetab, cash-out to rial
- GMV, merchant logos, testimonials

**Notes**

If a draft needs one of these to land, rewrite the draft.

We are not a wallet, exchange, custody, or off-ramp.

---

## 13 · Next step

**On slide**

- A yes on one surface.
- Omid Mirzaei
- pooli.shop
- omidomirzaei@gmail.com
- Legal entity: `[PLACEHOLDER — do not invent]`

**Notes**

Quiet CTA. pooli.shop. No “start now.”

If they want to try the product: create a payment, send the link, see Paid ✓.

---

## 14 · Appendix — flags & routes

**On slide**

| Item | State |
|------|--------|
| Live SHA | `ac9356d` on pooli.shop |
| Networks | `tron`, `bsc` — USDT |
| Telegram bot | @PooliShopbot — on |
| Mini App | `/t/app`, `/t/p/{slug}` |
| Instagram | implemented; flag off |
| Email | Resend — on |
| Google OAuth | on |
| Phone OTP | mock; off in production |
| Custody | none — merchant wallet |

**Notes**

Technical / ops appendix. Do not paste secrets or ops JSON.

Watchers healthy is an internal fact. Say “rails are on” if you must.

SSE is process-local. Do not advertise realtime infrastructure.
