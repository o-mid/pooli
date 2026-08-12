# Responsive

Primary target: **~390px** PWA.

| Viewport | Behavior |
|----------|----------|
| Small phone | `--page-max: 480px`, page padding `--space-4`, bottom tabs |
| iPhone-sized | Same; safe-area insets |
| Large Android | Same column, more vertical room |
| Tablet / desktop ≥900px | `--page-max-wide: 720px`, desktop New payment in chrome |

If mobile and desktop conflict, **mobile wins** unless desktop would become unusable.

Content widths, nav height (`--nav-height: 4.25rem`), and sheet padding all live in `globals.css`.
