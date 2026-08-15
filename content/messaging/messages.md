# Message house

Use with [`positioning.md`](positioning.md) and [`claims.md`](claims.md). If a line needs a feature that is PLANNED, it does not ship.

## Category

Checkout for people who sell in DMs.

Not: a wallet, an exchange, a bank, a crypto dashboard, a CRM.

FA: لینک پرداخت برای فروش در دایرکت.

## Problem

The sale happens in the chat. The payment happens somewhere else. Proof is a screenshot.

You agreed on a price. They say they paid. You are now a part-time accountant for your own DMs.

FA hooks we already trust:

- «رسید رو بفرست.»
- هنوز رسید چک می‌کنی؟
- «واریز کردم چک کن 🙏»

Do not invent a midnight anecdote as if it happened to a named person. The pattern is enough.

## Promise

Send a link. Know when they paid.

The money goes to your wallet. Pooli never holds it.

FA: لینک رو بفرست. وقتی پرداخت شد، خودت می‌فهمی.

## How it works (four steps, no chain)

1. New payment — amount in toman
2. Share the link
3. They pay
4. You see **Paid ✓**

FA: پرداخت جدید → بفرست → پرداخت می‌کنند → پرداخت شد ✓

Optional fifth beat, only if asked: we wait until the payment is actually there. Detected → Confirming → Paid ✓.

## Benefits (merchant)

| Benefit | Say | Don’t stretch into |
|---------|-----|-------------------|
| Time | You stop hunting receipts | “Save 10 hours a week” |
| Certainty | Paid ✓ is a status, not a screenshot | “Never a dispute” |
| Custody | Money lands on your address | “Your funds are insured” |
| Language | Toman in, no crypto homework | “Invisible blockchain” as poetry |
| Buyer friction | They open a page. No Pooli account | “One-tap universal pay” |
| Reuse | Reusable links if you sell the same thing | “Full storefront platform” |

## Trust

- We do not hold the money.
- The browser cannot mark Paid.
- Confirmations are visible as Detected → Confirming → Paid ✓.
- Demo screens are labeled demo (تهران اسنیکرز).
- If something looks wrong: Needs attention — we do not silently “fix” an approximate amount.

FA: پول می‌ره کیف خودت. پولی وسط نیست.

## Technology (second)

Only after the job is clear:

- USDT
- TRON and BNB Smart Chain (both **ENABLED** on production as of 15 Aug 2026)
- Unique payable amount
- Server-side verification
- Optional WalletConnect on BNB Chain; QR/copy always there
- Telegram bot on; Instagram composer **not** on

Never the first paragraph of a merchant post.

## Differentiators (only the ones we can defend)

1. **The unit of work is a link**, not a dashboard.
2. **Non-holding.** Destination is the merchant wallet.
3. **Exact amount matching.** Close enough does not become Paid.
4. **Commerce language.** Hash stays in Payment details.
5. **Persian-first product**, not a translated admin.

We do not claim we are cheaper, faster to confirm, or more adopted than anyone. We have not published those comparisons.

## Proof we actually have

| Proof | How to show it |
|-------|----------------|
| The site is live | pooli.shop |
| The landing sentence | Screenshot of the real homepage |
| The product exists | Labeled demo UI (create → checkout → Paid ✓) |
| Rails are up | Say “TRON and BNB Chain are on” only if the room needs it — do not paste ops JSON |
| Watchers healthy | Internal / technical only |

| Proof we do not have | |
|----------------------|---|
| Merchant logos | empty |
| GMV | empty |
| Press quotes | empty |
| App Store ratings | we are a PWA |

## CTAs

Ranked. Quiet wins.

| Rank | EN | FA | Use |
|------|----|----|-----|
| 1 | pooli.shop | pooli.shop | Default. Footer, bio, last slide |
| 2 | Send the link | لینک رو بفرست | Posters |
| 3 | Open Pooli | ورود به پولی | Product / landing button (already in UI) |
| 4 | Create a payment | پرداخت جدید | In-app |
| 5 | Try it with one order | با یک سفارش امتحان کن | Founder posts, not ads |

Avoid: “Start now”, “Get started today”, “Join the future”, «همین حالا شروع کنید».

## Objection handling (short)

| They say | We say |
|----------|--------|
| I don’t do crypto | You type toman. They pay. You see Paid ✓. |
| What if they send the wrong amount? | It does not become Paid. It needs attention. |
| Do you hold my money? | No. It goes to the address you set. |
| Is Instagram built-in? | Not for customers yet. You still paste the link into the DM. |
| Can I log in with SMS? | Not in production. Google sign-in is on. |
| Are you a company in [country]? | See media kit placeholders — do not guess. |

## Channel emphasis

| Channel | Lead with | Leave out |
|---------|-----------|-----------|
| Instagram | Pain + Paid ✓ + product crop | Rails, investor voice |
| LinkedIn company | The job, product shots, how it works | Fundraising tone |
| LinkedIn founder | First-person, specific, slightly imperfect | Announcement-speak |
| X | One beat, dry, native | LinkedIn paragraphs |
| Telegram (if we use it) | Same as merchant FA | English thought-leadership |
| Investor deck | Problem, product, honesty about stage | Fake traction |
| Partner deck | Where we plug in, what’s on / off | Raise narrative |
