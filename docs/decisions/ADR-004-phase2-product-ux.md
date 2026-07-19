# ADR-004: Phase 2 product, localization, and payment UX

## Context

MVP payment matching works. Phase 2 upgrades merchant/buyer experience without changing non-custodial settlement or server-side PAID rules.

## Decisions

1. **i18n:** English (`en`) and Persian (`fa`) via message catalogs and a client `LocaleProvider`. `fa` sets `dir=rtl`. Locale persists in cookie + `localStorage`. Auto-detect only seeds the first visit.
2. **Typography:** Vazirmatn Variable for Persian; DM Sans for Latin. Technical strings (addresses, hashes) use `dir=ltr` / `unicode-bidi: isolate` and tabular numerals for money.
3. **Auth:** Keep email/password sessions. Add Iranian phone OTP behind `OTPProvider` with a development mock; production requires a real SMS adapter. Store OTP hashes only (bcrypt). Enforce expiry, attempt limits, resend cooldown, and rate limits.
4. **Merchant identity:** Extend `merchants` with `display_name`, `description`, `logo_path`, `support_contact`. Logos stored under local `UPLOAD_DIR` with MIME sniffing and 2MB limit.
5. **Live progress:** Payment stages remain backend-driven (`AWAITING_PAYMENT` → `SEEN` → `CONFIRMING` → `PAID`). UI never invents percentages. Simulator can emit confirmation steps via `/internal/simulate/confirmations`. Chain-worker calls `ApplyConfirmations` after polling. SSE remains primary for API-local transitions; REST refetch on reconnect.
6. **Explorer URLs:** Centralized in `config.ExplorerTxURL` (env-overridable templates), exposed on public pay `matched_tx`.
7. **Reference amount UX:** Continue unique payable amounts; present as “send exactly …” with optional info, never as a fee.

## Non-goals

Custody, withdrawals, arbitrary tokens, WalletConnect requirement, Redis fan-out of worker SSE (additive follow-up).
