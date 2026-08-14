#!/usr/bin/env bash
# Point the bot menu button at the Pooli Mini App (seller home).
# Requires TELEGRAM_BOT_TOKEN. Optional TELEGRAM_MINIAPP_URL (default https://pooli.shop/t/app).
set -euo pipefail

: "${TELEGRAM_BOT_TOKEN:?set TELEGRAM_BOT_TOKEN}"
MINIAPP_URL="${TELEGRAM_MINIAPP_URL:-https://pooli.shop/t/app}"

curl -sS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setChatMenuButton" \
  -H "Content-Type: application/json" \
  -d "{
    \"menu_button\": {
      \"type\": \"web_app\",
      \"text\": \"Open Pooli\",
      \"web_app\": { \"url\": \"${MINIAPP_URL}\" }
    }
  }"
echo
