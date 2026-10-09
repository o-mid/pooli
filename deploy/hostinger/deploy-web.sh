#!/usr/bin/env bash
# Rebuild and restart pooli-web on the Hostinger VPS.
# Run on the server from anywhere, or: ssh root@HOST 'bash -s' < deploy/hostinger/deploy-web.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$SCRIPT_DIR"

if [[ -d "$REPO_ROOT/.git" ]]; then
  git -C "$REPO_ROOT" fetch origin main
  git -C "$REPO_ROOT" checkout main
  git -C "$REPO_ROOT" pull --ff-only origin main
  export GIT_SHA="$(git -C "$REPO_ROOT" rev-parse --short HEAD)"
else
  echo "note: $REPO_ROOT is not a git clone — building the tree on disk"
  export GIT_SHA="${GIT_SHA:-unknown}"
fi

echo "GIT_SHA=$GIT_SHA"
docker compose build pooli-web
docker compose up -d --wait pooli-web

curl -fsS -o /dev/null -w "pooli-web / → HTTP %{http_code}\n" http://127.0.0.1:3100/
curl -fsS -o /dev/null -w "pooli-web /about → HTTP %{http_code}\n" http://127.0.0.1:3100/about
