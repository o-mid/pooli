# ADR-004: Phase 2 product, localization, and payment UX

## Context

MVP payment matching works. Phase 2 upgrades merchant/buyer experience without changing non-custodial settlement or server-side PAID rules.

## Decisions

1. **i18n:** English (`en`) and Persian (`fa`) via next-intl-style message catalogs; `fa` forces `dir=rtl`. Persist locale in cookie/`localStorage`.
2. **Typography:** Vazirmatn for Persian; Geist/system sans for Latin. Technical strings (addresses, hashes) stay `dir=ltr` / `unicode-bidi: isolate`.
3. **Auth:** Keep email/password sessions. Add Iranian phone OTP behind `OTPProvider` with a development mock; production requires a real SMS adapter. Store OTP hashes only.
4. **Merchant identity:** Extend `merchants` with `display_name`, `description`, `logo_path`, `support_contact`. Logos stored under local `uploads/` (configurable) with type/size checks.
5. **Live progress:** Payment stages remain backend-driven (`AWAITING_PAYMENT` → `SEEN` → `CONFIRMING` → `PAID`). UI never invents percentages. Simulator can emit confirmation steps. SSE remains primary; REST refetch on reconnect.
6. **Explorer URLs:** Centralized in chain config, not hard-coded in React components.
7. **Reference amount UX:** Continue unique payable amounts; present as “send exactly …” with optional info, never as a fee.

## Non-goals

Custody, withdrawals, arbitrary tokens, WalletConnect requirement.
