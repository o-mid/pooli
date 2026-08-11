#!/usr/bin/env bash
# Checklist helper for proving a real TRON mainnet payment on the *current* deploy.
# Does not send funds. Prints the exact steps and evidence to capture.

set -euo pipefail

cat <<'EOF'
Pooli — current-revision TRON mainnet PAID proof
================================================

Prerequisites
- SSH/env audit done: RATE_PROVIDER is live (not mock), ENABLE_CHAIN_SIMULATOR=false
- TRON_NETWORK=mainnet, official USDT contract, worker healthy (/api/v1/ops/status)
- Merchant has an active TRON wallet you control

Steps
1. Log in as merchant on https://pooli.shop
2. Create a small order (Quick Pay), open checkout on phone
3. Note expires_at — prefer QUOTE_TTL_SECONDS>=1800 for the test window
4. Select TRON, copy exact USDT amount + address
5. Send EXACT amount from an external wallet
6. Wait for confirmations; buyer + merchant UIs must reach PAID without hard refresh

Evidence to save
- Tronscan tx URL
- payment_intents.status = PAID
- amount_reservations.status = consumed
- payment_options.status = SETTLED
- Screenshot: buyer success + merchant home/order shows paid
- Deployed GIT_SHA / ops status version at time of test

Worker restart gate (optional)
1. Create checkout, note amount
2. Stop pooli-chain-worker
3. Send USDT
4. Start worker
5. Expect backfill → PAID via event_id dedupe

Record results in docs/tron-mainnet-pilot.md under a new "Current revision" section.
EOF
