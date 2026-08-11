#!/usr/bin/env bash
# Deploy current local tree to pooli-vps Hostinger compose stack.
# Usage: ./scripts/deploy-hostinger.sh
# Requires: ssh alias `pooli-vps` (or POOLI_SSH=user@host)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
SSH_TARGET="${POOLI_SSH:-pooli-vps}"
GIT_SHA="$(git rev-parse HEAD)"
SHORT="$(git rev-parse --short HEAD)"

echo "=== Deploy Pooli to ${SSH_TARGET} @ ${SHORT} (${GIT_SHA}) ==="

ssh -o BatchMode=yes -o ConnectTimeout=20 "$SSH_TARGET" 'hostname; whoami' >/dev/null

rsync -az --delete \
  --exclude '.env' \
  --exclude 'deploy/hostinger/.env' \
  --exclude 'deploy/hostinger/.env.bak*' \
  --exclude 'node_modules' \
  --exclude 'apps/web/node_modules' \
  --exclude 'apps/web/.next' \
  --exclude '.git' \
  --exclude 'bin' \
  --exclude 'uploads/*' \
  --exclude '.DS_Store' \
  --exclude 'brand' \
  ./ "${SSH_TARGET}:/opt/pooli/"

echo "rsync ok"

ssh -o BatchMode=yes "$SSH_TARGET" "GIT_SHA='${GIT_SHA}' bash -s" <<'EOS'
set -euo pipefail
cd /opt/pooli/deploy/hostinger

python3 - <<PY
from pathlib import Path
import os
p = Path("/opt/pooli/deploy/hostinger/.env")
wanted = {
    "ENABLE_BSC_CHECKOUT": "false",
    "ENABLE_BSC_WATCHER": "false",
    "ENABLE_CHAIN_SIMULATOR": "false",
    "OTP_SMS_PROVIDER": "mock",
    "GIT_SHA": os.environ["GIT_SHA"],
}
out, seen = [], set()
for line in p.read_text().splitlines():
    if not line.strip() or line.strip().startswith("#") or "=" not in line:
        out.append(line)
        continue
    k, v = line.split("=", 1)
    k = k.strip()
    if k in wanted:
        out.append(f"{k}={wanted[k]}")
        seen.add(k)
    else:
        out.append(line)
        seen.add(k)
for k, v in wanted.items():
    if k not in seen:
        out.append(f"{k}={v}")
p.write_text("\n".join(out) + "\n")
for k in ["APP_ENV","RATE_PROVIDER","ENABLE_CHAIN_SIMULATOR","ENABLE_BSC_WATCHER","ENABLE_BSC_CHECKOUT","TELEGRAM_ENABLED","OTP_SMS_PROVIDER","GIT_SHA"]:
    for line in p.read_text().splitlines():
        if line.startswith(k + "="):
            print(line)
            break
    else:
        print(k + ": MISSING")
PY

export GIT_SHA
docker compose build --build-arg GIT_SHA="$GIT_SHA" pooli-api pooli-chain-worker pooli-web
docker compose up -d pooli-api pooli-chain-worker pooli-web

for i in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:8180/healthz >/dev/null 2>&1; then
    echo "api healthy"
    break
  fi
  sleep 2
done
curl -fsS http://127.0.0.1:8180/healthz
echo

docker compose --profile migrate run --rm pooli-migrate

DBUSER=$(grep -E '^POSTGRES_USER=' .env | cut -d= -f2-)
DBNAME=$(grep -E '^POSTGRES_DB=' .env | cut -d= -f2-)
docker exec pooli-postgres psql -U "$DBUSER" -d "$DBNAME" -c 'SELECT * FROM schema_migrations;'
docker exec pooli-postgres psql -U "$DBUSER" -d "$DBNAME" -c '\dt worker_heartbeats'

docker compose restart pooli-chain-worker
sleep 12
curl -fsS http://127.0.0.1:8180/api/v1/ops/status
echo
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'
EOS

echo
echo "=== Public confirmation ==="
curl -fsS "https://api.pooli.shop/api/v1/ops/status" | python3 -m json.tool
echo
echo "DEPLOY_OK ${SHORT}"
