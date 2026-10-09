#!/usr/bin/env bash
# Read-only audit of BSC payment options created while the watcher may have been blind.
# Default: print SQL. Pass --run to execute against DATABASE_URL (SELECT only).
# Do not point this at production until Omid says so.
set -euo pipefail

SINCE="${BSC_GAP_SINCE:-2026-08-20}"

SQL=$(cat <<EOF
-- Payment options on BSC created since ${SINCE}.
SELECT
  po.id AS option_id,
  po.status AS option_status,
  po.destination_address,
  po.pay_usdt_amount_base_units AS pay_amount,
  po.expires_at,
  po.created_at AS option_created_at,
  pi.id AS intent_id,
  pi.status AS intent_status,
  pi.merchant_id,
  m.name AS merchant_name,
  m.slug AS merchant_slug
FROM payment_options po
JOIN payment_intents pi ON pi.id = po.payment_intent_id
JOIN merchants m ON m.id = pi.merchant_id
WHERE po.network = 'bsc'
  AND po.created_at >= '${SINCE}'
ORDER BY po.created_at;

-- Distinct merchant wallets used on those options.
SELECT DISTINCT po.destination_address
FROM payment_options po
WHERE po.network = 'bsc'
  AND po.created_at >= '${SINCE}'
ORDER BY 1;

-- Chain events and matches in the same window.
SELECT
  ce.event_id,
  ce.tx_hash,
  ce.to_address,
  ce.amount_base_units,
  ce.observed_at,
  ce.confirmations,
  mt.match_type,
  mt.payment_intent_id,
  mt.payment_option_id
FROM chain_events ce
LEFT JOIN matched_transactions mt ON mt.chain_event_id = ce.id
WHERE ce.network = 'bsc'
  AND ce.observed_at >= '${SINCE}'
ORDER BY ce.observed_at;
EOF
)

if [[ "${1:-}" != "--run" ]]; then
  printf '%s\n' "$SQL"
  echo
  echo "Audit not executed. Re-run with --run and DATABASE_URL when Omid asks."
  exit 0
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required for --run" >&2
  exit 1
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "$SQL"
