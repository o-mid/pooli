# Deck notes

Two decks. Two jobs. Not clones.

| | Investor | Partner |
|--|----------|---------|
| Path | `content/decks/investor/` | `content/decks/partner/` |
| Slides | **13** | **14** |
| Job | Product + honest stage | Where Pooli plugs in |
| Ask | A conversation. Not a raise. | A yes on one surface |
| Proof | Live site + labeled demo | ENABLED vs PLANNED |
| Mint slide | 4 · Paid ✓ | 2 · the gap |

## How they differ

Investor is a narrative: receipt/DM problem → till insight → link → Paid ✓ → trust → who → flags → no TAM → empty traction → conversation.

Partner is operational: gap you sit in → four surfaces → Telegram on → Instagram built/off → wallets → agency workflow → flag matrix → what still happens in *their* product → what we need from you.

Do not present one as the other with a title swap.

## Source vs render

Committed (this folder):

- `investor/slides.md` + `investor/index.html`
- `partner/slides.md` + `partner/index.html`
- `deck.css`, `deck.js`, this file

Local only (gitignored `.local-brand-studio/`):

- Screenshots the HTML embeds (`product-screenshots/`, `product/compositions/`)
- PNG/PDF exports in `pitch/{investor,partner,exports}/`

Open `index.html` locally. GitHub will not show the phone crops — those files are gitignored.

Render:

```bash
python3 .local-brand-studio/scripts/render_decks.py
```

Present: open the HTML, ← → or click. `?print=1` stacks slides for Chrome PDF. `?slide=3` isolates one frame for PNG.

## Claims hygiene

Locked to `content/messaging/claims.md` (15 Aug 2026, SHA `ac9356d`).

Not in either deck: GMV, merchant count, named customers, TAM, investors, team size, legal entity, Instagram-on, phone login.

Demo label on every product crop: تهران اسنیکرز — synthetic.
