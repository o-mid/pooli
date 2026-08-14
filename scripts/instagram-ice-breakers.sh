#!/usr/bin/env bash
# Set Instagram Ice Breakers on the @pooli professional account.
# Requires INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_IG_USER_ID in the environment.
# Ice Breakers do not show on desktop Instagram — do not block launch on this.
set -euo pipefail

: "${INSTAGRAM_ACCESS_TOKEN:?set INSTAGRAM_ACCESS_TOKEN}"
: "${INSTAGRAM_IG_USER_ID:?set INSTAGRAM_IG_USER_ID}"
GRAPH_BASE="${INSTAGRAM_GRAPH_BASE:-https://graph.instagram.com}"
GRAPH_VERSION="${INSTAGRAM_GRAPH_VERSION:-v21.0}"

curl -sS -X POST "${GRAPH_BASE}/${GRAPH_VERSION}/${INSTAGRAM_IG_USER_ID}/messenger_profile" \
  -H "Authorization: Bearer ${INSTAGRAM_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "instagram",
    "ice_breakers": [
      {
        "locale": "default",
        "call_to_actions": [
          {"question": "پرداخت", "payload": "PAY"},
          {"question": "Pay", "payload": "PAY"}
        ]
      }
    ]
  }'
echo
