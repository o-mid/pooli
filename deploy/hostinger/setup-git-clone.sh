#!/usr/bin/env bash
# One-time: replace an rsync/copied tree under /opt/pooli with a git clone of origin/main.
# Preserves deploy/hostinger/.env and uploads/. Run on the VPS as root.
set -euo pipefail

TARGET="${POOLI_ROOT:-/opt/pooli}"
REPO_URL="${POOLI_REPO_URL:-https://github.com/o-mid/pooli.git}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARCHIVE="${TARGET}-rsync-archive-${STAMP}"
ENV_BACKUP="/root/pooli-hostinger.env.${STAMP}"

if [[ ! -d "$TARGET/deploy/hostinger" ]]; then
  echo "missing $TARGET/deploy/hostinger — set POOLI_ROOT or run on the Hostinger host"
  exit 1
fi

if [[ -f "$TARGET/deploy/hostinger/.env" ]]; then
  cp -a "$TARGET/deploy/hostinger/.env" "$ENV_BACKUP"
  chmod 600 "$ENV_BACKUP"
  echo "backed up .env → $ENV_BACKUP"
fi

if [[ -d "$TARGET/.git" ]]; then
  echo "$TARGET already has .git — fetching origin/main"
  git -C "$TARGET" fetch origin main
  git -C "$TARGET" checkout main
  git -C "$TARGET" pull --ff-only origin main
  if [[ -f "$ENV_BACKUP" ]]; then
    cp -a "$ENV_BACKUP" "$TARGET/deploy/hostinger/.env"
    chmod 600 "$TARGET/deploy/hostinger/.env"
  fi
  exit 0
fi

echo "archiving $TARGET → $ARCHIVE"
mv "$TARGET" "$ARCHIVE"

git clone --depth 1 --branch main "$REPO_URL" "$TARGET"

if [[ -f "$ENV_BACKUP" ]]; then
  cp -a "$ENV_BACKUP" "$TARGET/deploy/hostinger/.env"
  chmod 600 "$TARGET/deploy/hostinger/.env"
fi

if [[ -d "$ARCHIVE/uploads" ]] && [[ ! -d "$TARGET/uploads" ]] || [[ -z "$(ls -A "$TARGET/uploads" 2>/dev/null)" ]]; then
  mkdir -p "$TARGET/uploads"
  cp -a "$ARCHIVE/uploads/." "$TARGET/uploads/" 2>/dev/null || true
fi

chmod +x "$TARGET/deploy/hostinger/deploy-web.sh" "$TARGET/deploy/hostinger/deploy-chain-worker.sh"
echo "done: $(git -C "$TARGET" rev-parse --short HEAD) at $TARGET"
echo "archive kept at $ARCHIVE (remove when satisfied)"
