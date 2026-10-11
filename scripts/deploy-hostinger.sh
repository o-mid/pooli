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
  --exclude '.local-brand-studio' \
  --exclude '.cursor' \
  ./ "${SSH_TARGET}:/opt/pooli/"

echo "rsync ok"

ssh -o BatchMode=yes "$SSH_TARGET" "GIT_SHA='${GIT_SHA}' bash -s" <<'EOS'
set -euo pipefail
cd /opt/pooli/deploy/hostinger

python3 - <<'PY'
from pathlib import Path
import os
p = Path("/opt/pooli/deploy/hostinger/.env")
wanted = {
    "ENABLE_CHAIN_SIMULATOR": "false",
    "OTP_SMS_PROVIDER": "mock",
    "NEXT_PUBLIC_SITE_URL": "https://pooli.shop",
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

def env_get(key: str) -> str:
    for line in p.read_text().splitlines():
        if line.startswith(key + "="):
            return line.split("=", 1)[1].strip()
    return ""

for k in ["APP_ENV","RATE_PROVIDER","ENABLE_CHAIN_SIMULATOR","ENABLE_BSC_WATCHER","ENABLE_BSC_CHECKOUT","TELEGRAM_ENABLED","OTP_SMS_PROVIDER","NEXT_PUBLIC_SITE_URL","GIT_SHA"]:
    v = env_get(k)
    print(f"{k}={v}" if v != "" else f"{k}: MISSING")

wc = env_get("NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID")
if wc:
    print(f"NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: set (len={len(wc)})")
else:
    print("NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: MISSING (web will omit WalletConnect; QR/copy fallbacks remain)")
PY

export GIT_SHA
# Full stack: API SHA + worker rate refresh + web admin/timeline.
# Compose interpolates NEXT_PUBLIC_* from deploy/hostinger/.env into web build args.
docker compose build --build-arg GIT_SHA="$GIT_SHA" pooli-api pooli-chain-worker pooli-action-gateway pooli-web
docker compose up -d --wait pooli-api pooli-chain-worker pooli-action-gateway pooli-web

for i in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:8180/healthz >/dev/null 2>&1; then
    echo "api healthy"
    break
  fi
  sleep 2
done
curl -fsS http://127.0.0.1:8180/healthz
echo

GW_OK=0
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8280/healthz >/dev/null 2>&1; then
    echo "action-gateway healthy"
    GW_OK=1
    break
  fi
  sleep 2
done
if [[ "$GW_OK" -ne 1 ]]; then
  echo "WARN: pooli-action-gateway not healthy on :8280 (check AGENT_GATEWAY_SECRET and logs)"
  docker logs --tail 40 pooli-action-gateway || true
else
  curl -fsS http://127.0.0.1:8280/healthz
  echo
fi

WEB_OK=0
for i in $(seq 1 60); do
  code="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3100/login || echo 000)"
  if [[ "$code" == "200" ]]; then
    echo "web healthy (login=$code)"
    WEB_OK=1
    break
  fi
  sleep 2
done
if [[ "$WEB_OK" -ne 1 ]]; then
  echo "ERROR: pooli-web did not become healthy on :3100/login within timeout"
  docker ps --format 'table {{.Names}}\t{{.Status}}'
  docker logs --tail 80 pooli-web || true
  exit 1
fi
curl -fsS -o /dev/null -w "web_login_http=%{http_code}\n" http://127.0.0.1:3100/login

echo "schema check (no new migration in this revision)"
DBUSER=$(grep -E '^POSTGRES_USER=' .env | cut -d= -f2-)
DBNAME=$(grep -E '^POSTGRES_DB=' .env | cut -d= -f2-)
docker exec pooli-postgres psql -U "$DBUSER" -d "$DBNAME" -c 'SELECT version, dirty FROM schema_migrations;'
curl -fsS http://127.0.0.1:8180/api/v1/ops/status
echo
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'

# Confirm WalletConnect project id was baked into the web bundle (value never printed).
WC_PID="$(grep -E '^NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=' .env | cut -d= -f2- | tr -d '\r' || true)"
if [[ -z "${WC_PID}" ]]; then
  echo "wc_bundle_check: skipped (project id not set)"
else
  docker run --rm -e WC_PID="$WC_PID" --entrypoint node pooli-web:local -e "
    const fs = require('fs');
    const path = require('path');
    const pid = process.env.WC_PID || '';
    let hits = 0;
    function walk(dir) {
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const ent of entries) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(p);
        else if (ent.isFile() && p.endsWith('.js')) {
          try {
            if (fs.readFileSync(p, 'utf8').includes(pid)) {
              hits++;
              if (hits >= 3) return;
            }
          } catch {}
        }
        if (hits >= 3) return;
      }
    }
    walk('/app');
    console.log('wc_bundle_check:', hits > 0 ? 'ok' : 'MISSING_IN_BUNDLE', 'hits', hits);
  "
fi
EOS

echo
echo "=== Nginx (leave live vhost; proposed repo copy is sanitized generic paths) ==="
ssh -o BatchMode=yes "$SSH_TARGET" bash -s <<'NGINX'
set -euo pipefail
nginx -t
systemctl is-active nginx
grep -q 'pooli-unavailable' /etc/nginx/sites-available/pooli.shop
grep -q 'root /opt/pooli/deploy/hostinger/static' /etc/nginx/sites-available/pooli.shop
grep -q 'merchant/events' /etc/nginx/sites-available/pooli.shop
echo "nginx live vhost unchanged (opt/pooli paths preserved)"
NGINX

echo
echo "=== Public confirmation ==="
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS "https://api.pooli.shop/api/v1/ops/status" >/tmp/pooli-ops.json 2>/dev/null; then
    break
  fi
  sleep 2
done
python3 -m json.tool </tmp/pooli-ops.json
python3 - <<'PY'
import json
d=json.load(open("/tmp/pooli-ops.json"))
c=d.get("config") or {}
print("bsc_checkout:", c.get("enable_bsc_checkout"))
print("bsc_watcher:", c.get("enable_bsc_watcher"))
print("git_sha:", d.get("git_sha"))
print("ok:", d.get("ok"))
PY

echo
echo "=== Production smoke ==="
chmod +x ./scripts/smoke-prod.sh
./scripts/smoke-prod.sh 5

echo
echo "DEPLOY_OK ${SHORT}"