# Investor deck — slides + speaker notes

**Job:** Explain the product and the stage honestly.  
**Ask:** A conversation — not a fake raise.  
**Proof we have:** Live product on [pooli.shop](https://pooli.shop), labeled demo screens.  
**Proof we do not have:** GMV, merchant count, named customers, investors, a filled legal entity.

13 slides. 16:9. Present from `index.html` (← → or click).

Demo merchant in screenshots: **تهران اسنیکرز** — synthetic, labeled, not a customer.

---

## 1 · Title

**On slide**

- Pooli
- Send a link. Know when they paid.
- Checkout for people who sell in DMs.
- pooli.shop · August 2026
- A conversation. Not a raise.

**Notes**

Open with the live landing line. Do not invent a second brand sentence.

If they ask “are you raising?”: we want a conversation. There is no published round, valuation, or ask amount.

If they ask team size, HQ, or legal entity: those are placeholders in the media kit. Do not guess.

---

## 2 · Problem

**On slide**

- The sale happens in the chat.
- The payment happens somewhere else.
- Proof is a screenshot.

DM (pattern, not a named person):

- “I paid, can you check?”
- “Send the receipt.”
- “Which card? Is the amount right?”

**Notes**

Do not invent a midnight anecdote or a named shop. The pattern is enough.

The unpaid part of the job is usually the receipt — not the goods.

FA hooks we already trust, if the room is Persian: «رسید رو بفرست.» / «واریز کردم چک کن 🙏»

---

## 3 · Insight

**On slide**

- They already closed the order.
- They do not have a till.
- The right object is a link you send in the same chat.

**Notes**

The unit of work is a link, not a dashboard.

We are not asking the seller to become a crypto person. We are asking them to send a link.

Do not say “social-commerce infrastructure.” Say: for people who sell in DMs.

---

## 4 · Product

**On slide** (mint)

- Send a link. Know when they paid.
- Paid ✓
- They pay to your wallet. You see a status — not a screenshot.

**Notes**

Full sentence if they want it: Pooli turns a DM order into a checkout page — they pay to your wallet, you see Paid ✓.

Money goes to the seller’s wallet. Pooli never holds it.

Paid ✓ is a server fact. The browser cannot set it.

---

## 5 · How it works

**On slide**

1. New payment — amount in toman
2. Share the link
3. They pay
4. You see **Paid ✓**

**Notes**

No chain names on this slide.

Optional fifth beat, only if asked: we wait until the payment is actually there. Detected → Confirming → Paid ✓.

If they send the wrong amount: it does not become Paid. It needs attention.

Buyer does not install an app. They open a page. No Pooli account.

---

## 6 · Product screens

**On slide**

Three real crops: create → checkout → Paid ✓  
Caption: Demo · تهران اسنیکرز · not a customer

**Notes**

These are product screens, not a live book of business.

If they ask “is this a real shop?”: no. Synthetic demo, labeled on purpose.

Status words must match the product: Paid ✓ / Waiting for payment / Needs attention / Payment detected.

---

## 7 · Trust

**On slide**

- The money goes to your wallet. Pooli never holds it.
- Only the server can mark Paid ✓.
- Close enough does not become Paid.

**Notes**

Destination is the address the seller set.

We do not hold funds. We are not a wallet, exchange, custody, or off-ramp.

Do not say “insured,” “bank-grade,” or “instant settlement.” Confirmations take time; we show Detected → Confirming → Paid ✓.

---

## 8 · Who it’s for

**On slide**

- People who sell in Instagram and Telegram DMs.
- They quote in toman. The buyer opens a page.
- Not a wallet. Not an exchange. Not a bank. Not a CRM.

**Notes**

Persian-first product, not a translated admin.

Reusable links exist if they sell the same thing. That is not “a full storefront platform.”

If they ask “why you?” — only the three we can defend:

1. The job is the DM, not a dashboard.
2. Money never sits with us.
3. Paid ✓ is a server fact, not a screenshot.

We have not published a competitor matrix. Do not claim we beat anyone.

---

## 9 · What’s on vs off

**On slide**

**On**

- pooli.shop (live, SHA `ac9356d`)
- TRON and BNB Chain checkout (USDT)
- Telegram bot @PooliShopbot
- Email (Resend)
- Google sign-in

**Off**

- Instagram composer (built; flag off)
- Phone OTP (mock only — not a production login)

**Notes**

ENABLED is not “thousands of people use it.”

Do not say “Instagram payments” or “sign in with phone.”

Do not paste ops JSON. “Watchers healthy” is for a technical room, not this slide.

We support USDT on two networks. Not every chain, not every token.

---

## 10 · Why this shape

**On slide**

- The order is already agreed in a DM.
- A dashboard they have to leave the chat for is the wrong object.
- Toman in. A status they can trust out.
- The two rails we need are on.

No market-size number. On purpose.

**Notes**

Qualitative only. No TAM / SAM / SOM. No “4.2B opportunity.”

Why now, if asked: Instagram and Telegram are already the shop floor. Receipt-chasing is the leftover work. Telegram can sit next to the conversation. We did not wait for a third network.

Why not a wallet or an off-ramp: that is a different company. We mark Paid.

---

## 11 · What we will not claim

**On slide**

A quiet empty box:

- Traction / GMV / merchant count — not published.
- No named customers. No testimonials.
- No investors, raise, or valuation.
- Legal entity — placeholder. Do not invent one.

**Notes**

Empty is better than a number.

Site is live. That is not a book of business.

If they press for volume: we have not published it. Stop there.

---

## 12 · Ask / contact

**On slide**

- We want a conversation.
- Omid Mirzaei
- pooli.shop
- omidomirzaei@gmail.com
- Legal entity: `[PLACEHOLDER — do not invent]`

**Notes**

No “start now,” no “join the future,” no fake scarcity.

Press / entity / HQ / founded date: media-kit placeholders. Use founder email until filled.

---

## 13 · Appendix — technical

**On slide**

- Unique payable amount. Approximate never auto-settles.
- Server-only Paid. Browser cannot set it.
- USDT on TRON and BNB Smart Chain.
- QR / copy always. WalletConnect on BNB Chain.
- SSE is process-local. Postgres is the source of truth.
- Single-host Docker Compose. Honest if asked — not a headline.

**Notes**

For technical rooms only. Do not lead with this.

Instagram flag is off. Phone OTP is mock-only.

Do not advertise “realtime infrastructure.”

TRON matching has been exercised (ADR-007). That is a technical fact — not a GMV claim.

BSC watcher is healthy. Do not say “battle-tested at scale.”
