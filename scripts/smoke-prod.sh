#!/usr/bin/env bash
# Safe read-only production smoke checks. No auth, no writes.
# Usage: ./scripts/smoke-prod.sh [REPEAT]
set -euo pipefail

REPEAT="${1:-5}"
ORIGIN="${POOLI_ORIGIN:-https://pooli.shop}"
API="${POOLI_API:-https://api.pooli.shop}"
FAIL=0
PASS=0

check() {
  local label="$1"
  local url="$2"
  local expect="${3:-200}"
  local i code
  for i in $(seq 1 "$REPEAT"); do
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 -L "$url" || echo "000")"
    if [[ "$code" == "$expect" ]]; then
      PASS=$((PASS + 1))
    else
      echo "FAIL $label attempt=$i url=$url expected=$expect got=$code"
      FAIL=$((FAIL + 1))
    fi
  done
}

echo "=== smoke-prod repeat=$REPEAT origin=$ORIGIN api=$API ==="

check "home" "$ORIGIN/" 200
check "login" "$ORIGIN/login" 200
check "register" "$ORIGIN/register" 200
check "manifest" "$ORIGIN/manifest.webmanifest" 200
check "sw" "$ORIGIN/sw.js" 200
check "api-healthz" "$API/healthz" 200
check "api-ops" "$API/api/v1/ops/status" 200

echo "pass=$PASS fail=$FAIL"
if [[ "$FAIL" -gt 0 ]]; then
  echo "smoke-prod: FAILED"
  exit 1
fi
echo "smoke-prod: OK"
