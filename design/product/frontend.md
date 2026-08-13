# Frontend agent notes

Use existing Pooli components before creating new ones. Tokens live in `apps/web/src/app/globals.css` and are mapped in `tailwind.config.ts`. Do not hardcode arbitrary colors or spacing.

Merchant destinations: Home, Orders, Customers, Settings. New payment is an action, not a tab.

Commerce language. Hide crypto behind Payment details. Server-authoritative payment state — the browser cannot mark Paid.

Do not introduce dashboards, KPI walls, or cards when typography and spacing suffice. Respect RTL (addresses/hashes stay LTR via `.mono-ltr`). WCAG AA. Mobile first. Checkout stays lightweight.
