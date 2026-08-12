# External services cutover checklist

Use after production access works. Check boxes only when verified on the live host.

## Rates

- [ ] `RATE_PROVIDER=nobitex`
- [ ] `RATE_FALLBACK_PROVIDER=wallex`
- [ ] `APP_ENV=production` rejects mock (API starts)
- [ ] Create order → USDT quote looks market-plausible (not fixed 126000 mock)
- [ ] `/api/v1/ops/status` → `config.rate_provider` = `nobitex`

## Chain worker

- [ ] `ENABLE_CHAIN_SIMULATOR=false`
- [ ] `pooli-chain-worker` running
- [ ] `/api/v1/ops/status` → `worker.ok` = true (heartbeat fresh)
- [ ] Watcher cursor for `tron` updates under load

## Telegram

- [ ] Token rotated if ever exposed
- [ ] `TELEGRAM_ENABLED=true` + bot token + webhook secret set
- [ ] Webhook registered to `https://pooli.shop/api/v1/integrations/telegram/webhook`
- [ ] Merchant Settings → Connect → test notification

## WalletConnect / BSC

- [ ] WalletConnect Cloud project created; domain allowlist = `https://pooli.shop` only
- [ ] `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` set in `deploy/hostinger/.env` (not git)
- [ ] `NEXT_PUBLIC_SITE_URL=https://pooli.shop` set for web build
- [ ] **Web image rebuilt** after setting the project id (`docker compose build pooli-web`)
- [ ] Deploy log shows `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: set (len=…)` and `wc_bundle_check: ok`
- [ ] Missing-id path still OK locally (QR/copy fallbacks; no WC init)
- [ ] Real-device WC handoff tested when BSC checkout is intentionally enabled
- [ ] Keep `ENABLE_BSC_CHECKOUT=false` + `ENABLE_BSC_WATCHER=false` until BSC payment verification is production-ready
- [ ] Only then `ENABLE_BSC_CHECKOUT=true` + `ENABLE_BSC_WATCHER=true`

## Auth

- [ ] Google works end-to-end on pooli.shop
- [ ] Phone tab hidden in production while `OTP_SMS_PROVIDER=mock`
