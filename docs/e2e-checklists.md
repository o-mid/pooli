# Production E2E checklists (Omid)

Automated tests do **not** replace a real minimal-value mainnet payment.

## Shared preflight

- [ ] `GET https://api.pooli.shop/api/v1/ops/status` → `ok=true`, `git_sha` matches intended deploy
- [ ] `enable_chain_simulator=false`, `rate_provider!=mock`
- [ ] Migration version includes latest applied (`000011`+)
- [ ] Merchant completed onboarding + has correct network wallet
- [ ] Secrets absent from git / ops JSON

---

## TRON / USDT E2E

1. Merchant: Quick Pay → amount (e.g. small test) → create link.
2. Buyer: open `/p/{slug}` → choose **USDT · TRON** → send **exact** amount to shown address.
3. Expect buyer UI: detected → confirming → **Paid ✓** (never browser-forced).
4. Expect merchant home/order: **Paid ✓**.
5. DB: `payment_intents.status=PAID`, reservation `matched`/`consumed`, `matched_transactions` row, `notification_deliveries` once per channel/event_key.
6. Worker: `ops/status` worker heartbeat fresh; TRON cursor advancing.
7. Email/Telegram (if enabled): exactly one merchant paid notification.

### Failure notes

- Under/over amount → exception status, **not** PAID.
- Wrong contract/destination → unmatched / ignored.

---

## BNB Chain / USDT E2E

**Do not start until** `BSC_RPC_URL` is a reliable authenticated endpoint and watcher is healthy.

### Omid creates (manual)

1. Account at **Chainstack** or **Ankr** (or equivalent) with BSC mainnet JSON-RPC supporting `eth_getLogs`.
2. Set on VPS only:
   ```
   ENABLE_BSC_WATCHER=true
   ENABLE_CHAIN_SIMULATOR=false
   BSC_NETWORK=mainnet
   BSC_CHAIN_ID=56
   BSC_RPC_URL=<secret URL>
   BSC_USDT_CONTRACT=0x55d398326f99059fF775485246999027B3197955
   BSC_USDT_DECIMALS=18
   BSC_CONFIRMATIONS=15
   ```
3. Restart chain-worker; confirm `ops/status` cursors include `bsc` and heartbeat OK.
4. Set `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` and rebuild web.
5. Only then: `ENABLE_BSC_CHECKOUT=true` and restart API.

### Flow

1. Merchant adds **EVM** wallet (never a TRON address).
2. Create payment → buyer selects **USDT · BNB Chain**.
3. WalletConnect / EIP-681 / QR → send exact USDT.
4. Worker detects Transfer → token/dest/amount verified → confirmations ≥ 15 → **PAID**.
5. Buyer + merchant UI update; notifications once.
6. DB same invariants as TRON; `payment_options.network=bsc`.

### Definition of done

Merchant EVM wallet → payment → buyer BSC → detect → verify → confirm → PAID → notify once.

Keep `ENABLE_BSC_CHECKOUT=false` until this passes.
