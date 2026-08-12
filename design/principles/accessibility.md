# Accessibility

Accessibility is part of the design system, not a later pass.

| Requirement | Token / pattern |
|-------------|-----------------|
| Contrast | Ink `#0B1F1A` on `#F2F5F3` / white; brand `#0F8F6B` on white for large text and buttons with white label |
| Touch | `--control-height: 2.75rem` (44pt) |
| Focus | `--focus-ring` on `:focus-visible` |
| Motion | Honor `prefers-reduced-motion` and `prefers-reduced-transparency` |
| RTL | `dir=rtl` for FA; logical CSS properties |
| Technical strings | `.mono-ltr` / `unicode-bidi: isolate` for addresses |
| Live status | `aria-live="polite"` on payment progress and toasts |
| Forms | Visible labels; errors use `role="alert"` |
| Status | Text + optional check; color is not the only indicator |

Screen reader labels: nav `common.mainNav`, compact New payment `aria-label`.
