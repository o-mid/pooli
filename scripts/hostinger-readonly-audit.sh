#!/usr/bin/env bash
# Read-only Hostinger / VPS audit for Pooli.
# Usage:
#   POOLI_SSH='user@host' ./scripts/hostinger-readonly-audit.sh
# Optional:
#   POOLI_SSH_IDENTITY=~/.ssh/your_key
#   POOLI_REMOTE_DIR=/opt/pooli
#
# Never prints secret values — only names / set|empty|missing and safe enums.

set -euo pipefail

SSH_TARGET="${POOLI_SSH:-}"
IDENTITY="${POOLI_SSH_IDENTITY:-}"
REMOTE_DIR="${POOLI_REMOTE_DIR:-}"

if [[ -z "$SSH_TARGET" ]]; then
  echo "ERROR: set POOLI_SSH=user@host (and optionally POOLI_SSH_IDENTITY / POOLI_REMOTE_DIR)"
  echo "Example: POOLI_SSH=root@195.110.58.84 ./scripts/hostinger-readonly-audit.sh"
  exit 2
fi

SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=15)
if [[ -n "$IDENTITY" ]]; then
  SSH_OPTS+=(-o IdentitiesOnly=yes -i "$IDENTITY")
fi

remote() {
  ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "$@"
}

echo "=== Pooli Hostinger read-only audit ==="
echo "Target: $SSH_TARGET"
echo

echo "--- identity ---"
remote 'hostname; whoami; pwd; date -u'
echo

echo "--- find deploy dir ---"
if [[ -n "$REMOTE_DIR" ]]; then
  DEPLOY="$REMOTE_DIR"
else
  DEPLOY="$(remote 'bash -s' <<'EOS'
for d in /opt/pooli /root/pooli /var/www/pooli "$HOME/pooli"; do
  if [[ -f "$d/deploy/hostinger/docker-compose.yml" ]]; then echo "$d"; exit 0; fi
  if [[ -f "$d/docker-compose.yml" ]] && grep -q pooli-api "$d/docker-compose.yml" 2>/dev/null; then echo "$d"; exit 0; fi
done
exit 0
EOS
)" || true
fi
echo "DEPLOY_DIR=${DEPLOY:-NOT_FOUND}"
echo

echo "--- git (if present) ---"
if [[ -n "${DEPLOY:-}" ]]; then
  remote "bash -lc 'cd \"$DEPLOY\" && (git rev-parse HEAD; git status -sb; git log -1 --oneline) 2>/dev/null || echo no-git-repo'"
fi
echo

echo "--- docker ---"
remote 'command -v docker >/dev/null && docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Image}}" || echo "docker unavailable"'
echo

echo "--- compose services ---"
if [[ -n "${DEPLOY:-}" ]]; then
  remote "bash -lc 'cd \"$DEPLOY/deploy/hostinger\" 2>/dev/null || cd \"$DEPLOY\"; docker compose ps 2>/dev/null || true'"
fi
echo

echo "--- env names (no values) ---"
if [[ -n "${DEPLOY:-}" ]]; then
  remote "bash -s" <<EOS
ENVF=""
for f in "$DEPLOY/deploy/hostinger/.env" "$DEPLOY/.env"; do
  if [[ -f "\$f" ]]; then ENVF="\$f"; break; fi
done
if [[ -z "\$ENVF" ]]; then echo "env file: MISSING"; exit 0; fi
echo "env file: \$ENVF"
python3 - "\$ENVF" <<'PY'
import sys
from pathlib import Path
path = Path(sys.argv[1])
safe_print = {
  "APP_ENV","RATE_PROVIDER","RATE_FALLBACK_PROVIDER","RATE_POLICY",
  "ENABLE_CHAIN_SIMULATOR","ENABLE_BSC_WATCHER","ENABLE_BSC_CHECKOUT",
  "TELEGRAM_ENABLED","TRON_NETWORK","BSC_NETWORK","BSC_CHAIN_ID",
  "OTP_SMS_PROVIDER",
}
keys = [
  "APP_ENV","RATE_PROVIDER","RATE_FALLBACK_PROVIDER","RATE_POLICY",
  "ENABLE_CHAIN_SIMULATOR","ENABLE_BSC_WATCHER","ENABLE_BSC_CHECKOUT",
  "TELEGRAM_ENABLED","TELEGRAM_BOT_TOKEN","TELEGRAM_WEBHOOK_SECRET","TELEGRAM_BOT_USERNAME",
  "TRON_NETWORK","TRONGRID_API_KEY","TRON_USDT_CONTRACT",
  "BSC_RPC_URL","BSC_CHAIN_ID","BSC_USDT_CONTRACT",
  "GOOGLE_CLIENT_ID","GOOGLE_CLIENT_SECRET","SESSION_SECRET",
  "OTP_SMS_PROVIDER","GIT_SHA","NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID",
]
vals = {}
for line in path.read_text().splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, v = line.split("=", 1)
    vals[k.strip()] = v.strip().strip('"').strip("'")
for k in keys:
    v = vals.get(k)
    if v is None:
        print(f"{k}: MISSING_KEY")
    elif v == "":
        print(f"{k}: empty")
    elif k in safe_print:
        print(f"{k}: {v}")
    else:
        print(f"{k}: set (len={len(v)})")
PY
EOS
fi
echo

echo "--- local health probes from VPS ---"
remote 'curl -fsS -m 5 http://127.0.0.1:8180/healthz 2>/dev/null || echo "api :8180 healthz FAIL"
curl -fsS -m 5 http://127.0.0.1:8180/api/v1/ops/status 2>/dev/null || echo "ops/status FAIL or not deployed yet"
curl -fsS -m 5 -o /dev/null -w "web :3100 %{http_code}\n" http://127.0.0.1:3100/ 2>/dev/null || echo "web :3100 FAIL"'
echo

echo "=== audit complete (read-only) ==="
