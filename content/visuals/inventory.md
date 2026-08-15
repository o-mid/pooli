# Visual inventory

Version **2026-08-15**.

Tokens: brand `#0F8F6B`, paper `#F2F5F3`, ink `#0B1F1A` — from `apps/web/src/app/globals.css`. Do not invent a second palette.

HTML artboards and PNG/MP4 live in gitignored `.local-brand-studio/`. This file is the committed index.

Render: `python3 .local-brand-studio/scripts/render_html.py [path …]`  
Chrome headless + `sips` crop. Short banners use a larger window, then crop top-left to the artboard. If Chrome is missing, leave HTML and render later.

---

## Reuse (do not remake)

Winners from `.local-brand-studio/reviews/winners.md`:

| Role | Asset |
|------|--------|
| Best launch / pain | `social/instagram/posts/fa/02-receipt-pain` |
| Best product | `social/instagram/posts/fa/08-product-create` |
| Best brand | `social/instagram/posts/fa/05-paid-check` |
| Best story | `social/instagram/stories/fa/07-poll` |
| Best carousel | A — how it works (`carousels/a/`) |
| Best reel | `motion/rendered/01-receipt-to-paid.mp4` — **do not replace** |
| Best hook | «رسید رو بفرست.» |
| Best CTA | pooli.shop |

### Instagram feed 1080×1350

FA posts `01`–`10`: intro, receipt pain, old-vs-pooli, how-it-works, paid-check, detection, direct-wallet, product-create, midnight-dm, try-pooli.

EN adaptations: `01`, `02`, `05`, `07`, `10`.

### Stories / reels 1080×1920

FA stories `01`–`10`. EN: `01`, `04`, `10`.

Reels HTML: `01-receipt-to-paid`, `02-product-flow`, `03-link-path`. Rendered mp4 + gif in `motion/rendered/`.

### Carousels

- **A** how it works (cover → amount → link → pay → Paid ✓)
- **B** receipt chaos → Paid ✓ (already the before/after)
- **C** why / link / detect / wallet

### Illustrations (no coins)

`illustrations/source/`: `01-send-the-link`, `02-payment-arriving`, `03-paid-check` + motion, `04-receipt-chaos`, `05-direct-to-wallet`, `mark`, `logo-en`.

### Product

Screenshots: `product-screenshots/390-*.png` and `product/screenshots/crop-*.png` (تهران اسنیکرز demo).

Compositions: `01-paid-closeup`, `02-home`, `03-orders`.

### Templates / contact sheets

`templates/{quote,product-screenshot,announcement,paid-check}`. Contact sheets: feed-fa, stories-fa, carousel-covers.

### Runtime logos (committed)

`apps/web/public/brand/mark.svg`, `logo-color.svg`, `logo-fa.svg`. Large PNG pack is local `brand/logos/` (gitignored).

---

## Added this pass (2026-08-15)

| File | Size | Job |
|------|------|-----|
| `social/linkedin/company-banner.html` | 1128×191 | Mark + “Send a link. Know when they paid.” Paper. No screenshot. |
| `social/linkedin/personal-banner.html` | 1584×396 | Left 528px empty for avatar. Right: Paid ✓ crop only. |
| `social/x/header.html` | 1500×500 | Wordmark left, Paid ✓ right. Paper. No chart. |
| `pitch/architecture.html` + `architecture.svg` | 1920×1080 | Merchant → link → buyer pays wallet → worker → Paid ✓ |
| `pitch/before-after.html` | 1920×1080 | Deck-only cut of an already-covered social story |
| `pitch/hero.html` | 1920×1080 | Real crops: create, paid closeup, checkout success |
| `media-kit/logo-sheet.html` | 1920×1080 | Mark + EN/FA wordmarks on paper |
| `motion/source/paid-check-draw-16x9.html` | 1920×1080 | Optional quiet check-draw for decks. `#play`. Not a reel 01 replacement. |

Studio CSS gained artboard classes for those sizes. `scripts/render_html.py` now sizes and crops them.

### Before / after note

DM receipt chaos vs Paid ✓ is **already** carousel B and `posts/fa/03-old-vs-pooli` (plus launch post 02 and reel 01). No new IG frame. `pitch/before-after.html` is the 16:9 deck tighten. See `.local-brand-studio/pitch/NOTES.md`.

---

## Rejected / not made

See `.local-brand-studio/rejected/README.md`.

This pass did not make: a new IG before/after, full-mint banners, personal banner with 1-line **and** screenshot, Kubernetes art, fake 3D phones, coin/chart X header, a replacement for reel 01.

Early square 1080×1080 templates stay in `rejected/early-square-html/`.

---

## Render status

Recorded when this inventory shipped. Re-run the script to refresh PNGs.

| Artboard | HTML | PNG |
|----------|------|-----|
| LinkedIn company | yes | see studio after render |
| LinkedIn personal | yes | see studio after render |
| X header | yes | see studio after render |
| Architecture | yes + SVG | see studio after render |
| Before/after 16:9 | yes | see studio after render |
| Hero 16:9 | yes | see studio after render |
| Logo sheet | yes | see studio after render |
| Check-draw 16:9 | yes | static PNG (end state unless `#play`) |

Existing IG / story / reel / composition PNGs were already rendered; this pass does not re-mint them.
