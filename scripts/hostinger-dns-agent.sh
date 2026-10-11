#!/usr/bin/env bash
# Add agent.pooli.shop A record via Hostinger API (requires HOSTINGER_API_TOKEN).
set -euo pipefail

DOMAIN="${HOSTINGER_DNS_DOMAIN:-pooli.shop}"
SUB="${HOSTINGER_DNS_SUB:-agent}"
IP="${HOSTINGER_DNS_IP:-195.110.58.84}"
TOKEN="${HOSTINGER_API_TOKEN:-}"

if [[ -z "$TOKEN" ]]; then
  echo "ERROR: set HOSTINGER_API_TOKEN (hPanel → API)"
  exit 2
fi

payload="$(python3 - <<PY
import json
print(json.dumps({
  "overwrite": False,
  "zone": [{
    "name": "${SUB}",
    "type": "A",
    "ttl": 14400,
    "records": [{"content": "${IP}"}]
  }]
}))
PY
)"

curl -fsS -X PUT "https://developers.hostinger.com/api/dns/v1/zones/${DOMAIN}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$payload"
echo
echo "DNS update submitted for ${SUB}.${DOMAIN} -> ${IP}"
