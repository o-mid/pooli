#!/usr/bin/env bash
# Rebuild and restart pooli-chain-worker (and pooli-api if sharing GIT_SHA image tag).
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
docker compose build pooli-chain-worker pooli-api
docker compose up -d --wait pooli-chain-worker pooli-api

echo "ops status (first 500 chars):"
curl -fsS http://127.0.0.1:8180/api/v1/ops/status | head -c 500
echo
