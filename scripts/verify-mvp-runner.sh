#!/usr/bin/env bash
# Orchestrates API restart during scripts/verify-mvp.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
API_BIN="${API_BIN:-$ROOT/bin/api}"
API_URL="${API_BASE_URL:-http://127.0.0.1:8080}"
export DATABASE_URL="${DATABASE_URL:-postgres://pooli:pooli@localhost:5432/pooli?sslmode=disable}"
# Local MVP verify exercises both rails via the chain simulator.
export ENABLE_CHAIN_SIMULATOR="${ENABLE_CHAIN_SIMULATOR:-true}"
export ENABLE_BSC_CHECKOUT="${ENABLE_BSC_CHECKOUT:-true}"
export ENABLE_BSC_WATCHER="${ENABLE_BSC_WATCHER:-true}"
export APP_ENV="${APP_ENV:-development}"
# Verify must never depend on live market rates.
export RATE_PROVIDER="${RATE_PROVIDER:-mock}"

mkdir -p bin
go build -o "$API_BIN" ./apps/api

# stop any previous api on 8080
if lsof -tiTCP:8080 -sTCP:LISTEN >/dev/null 2>&1; then
  lsof -tiTCP:8080 -sTCP:LISTEN | xargs kill || true
  sleep 0.5
fi

nohup "$API_BIN" > /tmp/pooli-api-verify.log 2>&1 &
echo $! > /tmp/pooli-api-verify.pid
for i in $(seq 1 40); do
  if curl -fsS "$API_URL/healthz" >/dev/null 2>&1; then break; fi
  sleep 0.25
done
curl -fsS "$API_URL/healthz" >/dev/null

rm -f /tmp/pooli-verify-restart.flag

# watchdog: when verify script requests restart, bounce API
(
  while true; do
    if [[ -f /tmp/pooli-verify-restart.flag ]]; then
      echo "restarting API for persistence check..."
      kill "$(cat /tmp/pooli-api-verify.pid)" 2>/dev/null || true
      sleep 0.8
      nohup "$API_BIN" > /tmp/pooli-api-verify.log 2>&1 &
      echo $! > /tmp/pooli-api-verify.pid
      rm -f /tmp/pooli-verify-restart.flag
      for i in $(seq 1 40); do
        if curl -fsS "$API_URL/healthz" >/dev/null 2>&1; then break; fi
        sleep 0.25
      done
    fi
    sleep 0.2
  done
) &
WATCHDOG=$!

cleanup() {
  kill "$WATCHDOG" 2>/dev/null || true
  if [[ -f /tmp/pooli-api-verify.pid ]]; then
    kill "$(cat /tmp/pooli-api-verify.pid)" 2>/dev/null || true
  fi
}
trap cleanup EXIT

API_BASE_URL="$API_URL" ./scripts/verify-mvp.sh
echo "runner done"
