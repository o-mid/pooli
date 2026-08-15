# Pooli brand book

Version 2026-08-15. Tokens are copied from [`apps/web/src/app/globals.css`](../../apps/web/src/app/globals.css). If this page and CSS disagree, **CSS wins**.

This is the committed brand book. Local spreads, Peyda lockups, and PNG proofs live in gitignored `.local-brand-studio/brand-book/`.

Related: [color](color.md) · [type](typography.md) · [logo](logo-guidelines.md) · [illustration](illustration.md) · [photography](photography.md) · [social identity](social-identity.md) · [deck identity](deck-identity.md) · [motion](motion.md) · [writing](../principles/writing-principles.md)

Messaging lives in [`content/messaging/`](../../content/messaging/). Do not invent a second promise here.

---

## 1. Brand idea

Pooli makes getting paid from a DM feel as simple as sending a message.

**Promise:** Crypto complexity disappears. The seller sees **Paid ✓**.

**Public 1-line:** Send a link. Know when they paid.  
**FA:** لینک رو بفرست. وقتی پرداخت شد، خودت می‌فهمی.

## 2. Personality

Simple · Warm · Confident · Trustworthy · Modern

Closer to a calm wallet status screen than to a crypto terminal or a SaaS chart wall.

| We are | We are not |
|--------|------------|
| Quiet type on mint-paper | Neon, glass, coin rain |
| One idea per frame | Feature dump |
| Commerce words | Infrastructure words |
| Slightly imperfect founder voice | “Thrilled to announce” |
| Labeled demo screens | Fake customers |

## 3. Logo

Runtime: `apps/web/src/components/BrandMark.tsx` and `apps/web/public/brand/`.

- **Mark:** mint rounded square (`rx=16` on a 64 box) with a white P. It reads as a leaf-like P, not a coin.
- **EN wordmark:** Pooli, DM Sans, weight 700, tracking −0.03em
- **FA wordmark:** پولی, Peyda Black (marketing / logo only — UI body is Vazirmatn)
- **Lockup:** mark + word, 10px gap at default size
- **Clear space:** at least the cap-height of the wordmark on all sides
- **Minimum:** 24px mark in UI; 48px on social; 80px wide wordmark
- **App icon:** mark on `#0F8F6B`

Don’t: Apple blue, Bitcoin/TRON marks, drop shadows, stretch, outline, write **پولیی**, set the FA word in a Latin font.

Tones: color, mono ink, on-dark (mark stays mint or flips to light P on mint), on-light.

## 4. Color

Do not invent a campaign palette.

### Light (`:root`)

| Role | Token | Hex |
|------|-------|-----|
| Background | `--bg` | `#F2F5F3` |
| Grouped / paper | `--bg-grouped` | `#E8EEEB` |
| Surface | `--surface` | `#FFFFFF` |
| Ink | `--ink` | `#0B1F1A` |
| Secondary | `--ink-secondary` | `#5A7168` |
| Tertiary | `--ink-tertiary` | `#8A9E95` |
| Brand | `--brand` | `#0F8F6B` |
| Brand hover | `--brand-hover` | `#0C7A5C` |
| On-brand | `--brand-ink` | `#FFFFFF` |
| Warning | `--warning` | `#B45309` |
| Danger | `--danger` | `#C62828` |
| Info | `--info` | `#0B6E99` |

Brand-soft is `rgba(15, 143, 107, 0.12)`. Separators are `rgba(11, 31, 26, 0.1)`.

### Dark (`html[data-theme="dark"]`)

Background `#0E1512`, surface `#17211D`, ink `#EEF4F1`, brand `#2BB889`. Do not invert the light palette by hand.

### Marketing use

- Default ground: `#F2F5F3`
- About **2 in 10** frames may be full mint — Paid ✓ or a single CTA
- Status green **is** brand. Do not add a second “success” hue

## 5. Type

| Use | Family |
|-----|--------|
| English UI + EN marketing | DM Sans |
| Persian UI + FA body | Vazirmatn Variable |
| FA display / wordmark | Peyda Black |
| Addresses, hashes, slugs | ui-monospace + `.mono-ltr` (always LTR) |

### Ramp (16px root)

| Role | Token | Size |
|------|-------|------|
| Display | `--text-large-title` | 34px |
| Monetary | `--text-title1` | 28px, tabular |
| Title 2 | `--text-title2` | 22px |
| Title 3 | `--text-title3` | 20px |
| Headline / button | `--text-headline` | 17px semibold |
| Body | `--text-body` | 17px |
| Callout | `--text-callout` | 16px |
| Subhead | `--text-subhead` | 15px |
| Footnote | `--text-footnote` | 13px |
| Caption | `--text-caption` | 12px |

Social display may go 72–120px. Still one idea. Still these families.

Weights in product: 400, 600, 700. Don’t load a decorative English serif “for the deck.”

## 6. Grid, space, radius

- **8pt grid.** Tokens `--space-1` (4px) … `--space-12` (48px)
- Merchant column `--page-max: 480px`; wide `--page-max-wide: 720px`
- Controls `--control-height: 44px` (2.75rem)
- Radii: 8 / 12 / 16 / 22 / pill. Lists prefer 12–16. Don’t pill everything
- Concentric nesting: inner radius smaller than the surface it sits on
- Elevation: separators first. `--shadow` is rare

Social feed margin ~88px. Story safe ~220 top / 280 bottom (system chrome).

## 7. Buttons

From `.btn` in `globals.css`. Marketing CTAs should look like these, not like a third kit.

| Kind | Look |
|------|------|
| Primary | Mint fill, `--brand-ink` type, full width in product |
| Secondary | White, 1px separator, ink type |
| Ghost | No fill, brand type |
| Destructive | `--danger` fill, white type |
| Pressed | `scale(0.98)`, 120ms, `--ease-out` |

No gradients on buttons. No glow.

Quiet marketing CTA: the word `pooli.shop` in secondary ink, sometimes a small pill. Not «همین حالا شروع کنید».

## 8. Status

Status is a sentence, not a traffic light. Color is never the only signal.

| EN | FA | Color role |
|----|----|------------|
| Paid ✓ | پرداخت شد ✓ | Brand / success |
| Waiting for payment | منتظر پرداخت | Secondary ink |
| Payment detected | پرداخت دیده شد | Info / brand-soft |
| Confirming payment | در حال تأیید | Info |
| Needs attention | نیاز به بررسی | Warning |
| New payment | پرداخت جدید | Action, not a status |

Don’t invent “Success!” or a check-circle explosion.

## 9. Illustration

See [illustration.md](illustration.md). Motifs we already have: send-the-link, payment arriving, paid check, receipt chaos, direct-to-wallet.

Stroke 3–6px, mint + ink, no coins, no astronauts, no 3D fintech blobs. One motif per frame.

## 10. Motion

See [motion.md](motion.md). Product: 120ms / 200ms / `cubic-bezier(0.16, 1, 0.3, 1)`. Marketing may use a close cousin `cubic-bezier(0.22, 1, 0.36, 1)` for 2–8s pieces.

No bounce, no confetti, no spinning coins. Paid check draws in ~0.7s. Honor `prefers-reduced-motion`.

## 11. Screenshots

- Crop to the product column. Prefer a large crop over a tiny fake iPhone.
- Demo merchant only. Current studio label: **تهران اسنیکرز**.
- Never production PII.
- Type must remain readable at feed size. If it doesn’t, crop tighter or set the same UI in large type — don’t decorate the bezel.

## 12. Photography

See [photography.md](photography.md). Everyday selling, cool-green to sit on `--bg`. No “crypto trader” stock.

## 13. Social identity

See [social-identity.md](social-identity.md). Sizes verified against 2026 public guides (Buffer / platform docs summaries). Handles are **candidates, unchecked**.

## 14. Deck identity

See [deck-identity.md](deck-identity.md). Big type, whitespace, real (demo) screens. No fake TAM.

## 15. Voice recap

- FA: everyday Iranian shop talk. نیم‌فاصله when natural.
- EN: short commerce English. Contractions OK.
- Brand: **پولی** / **Pooli**
- CTA: pooli.shop

Full lists: [`content/messaging/banned-phrases.md`](../../content/messaging/banned-phrases.md).
