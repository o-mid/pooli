#!/usr/bin/env bash
set -euo pipefail
OPTION_ID="${1:?PAYMENT_OPTION_ID required}"
API="${API_BASE_URL:-http://127.0.0.1:8080}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

ROW=$(docker compose -f "$ROOT/docker-compose.yml" exec -T postgres \
  psql -U pooli -d pooli -Atc \
  "SELECT network || '|' || destination_address_normalized || '|' || token_contract || '|' || pay_usdt_amount_base_units
   FROM payment_options WHERE id='${OPTION_ID}'")
IFS='|' read -r NETWORK DEST TOKEN AMOUNT <<<"$ROW"
if [[ -z "${NETWORK:-}" ]]; then
  echo "payment option not found" >&2
  exit 1
fi

EVENT_ID="sim:${OPTION_ID}:$(date +%s)"
CHAIN_JSON=""
if [[ "$NETWORK" == "bsc" ]]; then
  CHAIN_JSON='"chain_id": 56,'
fi

BODY=$(cat <<EOF
{
  "event_id": "$EVENT_ID",
  "network": "$NETWORK",
  $CHAIN_JSON
  "tx_hash": "0xsim$(date +%s)",
  "log_index": 0,
  "token_contract": "$TOKEN",
  "from": "simulator",
  "to": "$DEST",
  "amount_base_units": $AMOUNT,
  "block_number": 1,
  "confirmations": 99,
  "observed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
)

curl -fsS -X POST "$API/api/v1/internal/simulate/chain-event" \
  -H 'Content-Type: application/json' \
  -d "$BODY"
echo
