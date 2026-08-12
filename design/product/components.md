# Components

Keep a small set. Do not grow `packages/ui`.

| Piece | Path |
|-------|------|
| Tokens / CSS patterns | `apps/web/src/app/globals.css` |
| Page header | `components/ui/PageHeader.tsx` |
| Status (text, not loud chips) | `components/ui/StatusBadge.tsx` |
| Payment row | `components/ui/OrderListRow.tsx` |
| Empty state | `components/ui/EmptyState.tsx` |
| Amount | `components/ui/AmountDisplay.tsx` |
| Back | `components/ui/BackLink.tsx` |
| New payment | `components/NewPaymentButton.tsx` |
| Tab bar | `components/Nav.tsx` |
| Buyer payment details | `components/checkout/PaymentDetailsDisclosure.tsx` |

Spacing: `--space-1` … `--space-12` (8pt grid).  
Radius: 8 / 12 / 16 / 22 / pill. Prefer 12–16 in lists; don’t pill everything.  
Lists: inset grouped `.list-group` / `.list-row`.
