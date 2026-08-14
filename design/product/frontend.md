# Frontend agent notes

Use existing Pooli components before creating new ones. Tokens live in `apps/web/src/app/globals.css` and are mapped in `tailwind.config.ts`. Do not hardcode arbitrary colors or spacing.

Merchant destinations: Home, Orders, Customers, Settings. New payment is an action, not a tab.

Commerce language. Hide crypto behind Payment details. Server-authoritative payment state — the browser cannot mark Paid.

Do not introduce dashboards, KPI walls, or cards when typography and spacing suffice. Respect RTL (addresses/hashes stay LTR via `.mono-ltr`). WCAG AA. PWA first (iPhone SE and Pro Max). Checkout stays lightweight.

## UI task order

1. User goal, then existing components.
2. HIG/Sosumi for interaction reasoning; hig-mcp for metrics when available.
3. Pooli tokens only. Prefer project primitives over new widgets.
4. Hierarchy before decoration. Progressive disclosure.
5. States: default, pressed, focus, disabled, loading, success/error. Hover only when the pointer can hover.
6. Audit WCAG, 44pt targets, contrast, RTL, reduced motion/transparency, SE + Pro Max, standalone safe areas.
7. Ask if the screen can lose elements and still work. Fix audit issues before done.
