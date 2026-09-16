#!/usr/bin/env bash
# Long-lived launcher.
#
# `nohup ... &` from a one-shot shell gets the process reaped the moment that
# shell exits, which cost real time to diagnose twice. Backgrounding and then
# `wait`-ing keeps this script alive as the parent, so the server outlives the
# invocation.
set -euo pipefail
cd "$(dirname "$0")"

export OAUTH_STATE_DIR="${OAUTH_STATE_DIR:-/tmp/gw-state}"
export PORT="${PORT:-8791}"
export PUBLIC_URL="${PUBLIC_URL:-http://localhost:${PORT}}"

mkdir -p "$OAUTH_STATE_DIR"
: > server.log

node server.mjs >> server.log 2>&1 &
echo "gateway pid $! on :$PORT (state: $OAUTH_STATE_DIR)"
wait
