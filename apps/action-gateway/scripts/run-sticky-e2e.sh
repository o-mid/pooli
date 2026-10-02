#!/usr/bin/env bash
# Build, start one gateway process, run e2e.mjs twice (sticky server state).
set -euo pipefail
cd "$(dirname "$0")/.."

export OAUTH_STATE_DIR="${OAUTH_STATE_DIR:-/tmp/pooli-gw-e2e-state}"
export PORT="${PORT:-8791}"
export PUBLIC_URL="${PUBLIC_URL:-http://localhost:${PORT}}"

rm -rf "$OAUTH_STATE_DIR"
mkdir -p "$OAUTH_STATE_DIR"

npm run build
node server.mjs >>"$OAUTH_STATE_DIR/server.log" 2>&1 &
pid=$!
trap 'kill "$pid" 2>/dev/null || true' EXIT

for i in $(seq 1 30); do
  if curl -sf "$PUBLIC_URL/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
done

echo "=== e2e run 1 (sticky server) ==="
node e2e.mjs "$PUBLIC_URL"
echo "=== e2e run 2 (same server, new OAuth session) ==="
node e2e.mjs "$PUBLIC_URL"
echo "sticky e2e OK"
