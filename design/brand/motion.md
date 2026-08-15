# Motion

Product tokens (`globals.css`):

- `--duration-fast`: 120ms
- `--duration`: 200ms
- `--ease-out`: `cubic-bezier(0.16, 1, 0.3, 1)`
- Pressed: `scale(0.98)`
- No bounce, no staggered card entrances, no ambient loops

Marketing (reels, stories, deck builds) may use 2–8 seconds and `cubic-bezier(0.22, 1, 0.36, 1)` — close, not a second personality.

## Allowed stories

1. Receipt chaos → Paid ✓
2. Amount → link → page → Paid ✓
3. Check mark draw (~0.7s)

## Not allowed

Spinning coins, particle mint, fake 3D phones orbiting, count-up GMV, “AI” shimmer.

Honor `prefers-reduced-motion`: jump to the end state.

Prototypes live in `.local-brand-studio/motion/` (HTML/CSS/SVG, GIF, MP4). Do not commit the binaries.
