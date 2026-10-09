# Public site plan

Marketing surface for Pooli inside `apps/web` (Next.js 14 App Router). No API or payment logic changes.

## Routes

| Path | File | Notes |
|------|------|--------|
| `/` | `src/app/(marketing)/page.tsx` | Landing + JSON-LD graph |
| `/about` | `src/app/(marketing)/about/page.tsx` | Imprint, founder, AboutPage schema |
| `/contact` | `src/app/(marketing)/contact/page.tsx` | ContactPage schema |
| `/faq` | `src/app/(marketing)/faq/page.tsx` | Full FAQ + FAQPage schema |
| `/security` | `src/app/(marketing)/security/page.tsx` | Facts + disclosure |
| `/privacy` | `src/app/(marketing)/privacy/page.tsx` | Draft banner via `siteConfig.legalReviewed` |
| `/terms` | `src/app/(marketing)/terms/page.tsx` | Draft banner |
| `/.well-known/security.txt` | `src/app/.well-known/security.txt/route.ts` | RFC 9116 from `siteConfig` |
| `/llms.txt` | `src/app/llms.txt/route.ts` | |
| `/humans.txt` | `src/app/humans.txt/route.ts` | |

Persian: cookie/`pooli_locale` (existing). URL `/fa/*` deferred — no hreflang alternates until URL locale lands.

## Shared modules

- `src/lib/site.ts` — single source for company, founder, contact, social, legal flag
- `src/lib/json-ld.ts` — graph builders
- `src/lib/site-metadata.ts` — `generatePageMetadata()` helper
- `src/i18n/messages/marketing-content.ts` — EN/FA marketing strings merged into `en.ts` / `fa.ts`

## Components (`src/components/marketing/`)

- `SiteHeader.tsx` — nav, sheet, language, theme, auth CTAs
- `SiteFooter.tsx` + `Imprint.tsx`
- `Section.tsx`, `FaqAccordion.tsx`, `JsonLd.tsx`
- `CheckoutDemo.tsx` — static PaymentState ladder (client)
- `ThemeToggle.tsx`
- `MarketingShell.tsx` — skip link, header, footer, main landmark

## Styles

Extend `globals.css` with `.marketing-*` (nav, sections, footer, FAQ). Tokens only.

## Footprint

- `src/app/sitemap.ts`, `src/app/robots.ts`
- `opengraph-image.tsx` on marketing routes (dynamic OG); fallback `public/brand/og-default.png`
- Root `layout.tsx` metadata aligned to `siteConfig`
- `robots: noindex` on `/app`, `/admin`, `/login`, `/register`, `/p`, `/t`, `/link` via server layouts or metadata
- Manifest: `start_url` → `/app`, `lang`/`dir`/`categories`

## Tests (`apps/web/src/lib/`)

- `site.test.mjs` — shape + no duplicate address/email grep
- `sitemap.test.mjs`, `robots.test.mjs`, `json-ld.test.mjs`, `i18n-parity.test.mjs`

## Risks

- Splitting `app/app/layout.tsx` for noindex metadata (server wrapper + existing client shell).
- CSP not added globally (WalletConnect on checkout); safe headers only in `next.config.mjs`.
- BSC watcher health (open item #7) — copy still matches claims register as of repo docs.
- No new dependencies.

## Verification

`cd apps/web && npm run lint && npm run test && npm run build`
