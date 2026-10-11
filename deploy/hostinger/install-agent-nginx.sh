#!/usr/bin/env bash
# Install or refresh agent.pooli.shop nginx vhost on the VPS (run as root).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
SITE="agent.pooli.shop"
AVAIL="/etc/nginx/sites-available/${SITE}"
ENABLED="/etc/nginx/sites-enabled/${SITE}"
CERT="/etc/letsencrypt/live/${SITE}/fullchain.pem"
EMAIL="${CERTBOT_EMAIL:-omid@pooli.shop}"

if ! curl -fsS http://127.0.0.1:8280/healthz >/dev/null; then
  echo "ERROR: pooli-action-gateway not healthy on :8280"
  exit 1
fi

if [[ ! -f "$CERT" ]]; then
  cp "${ROOT}/nginx-agent.bootstrap.conf" "$AVAIL"
  ln -sf "$AVAIL" "$ENABLED"
  nginx -t
  systemctl reload nginx
  echo "HTTP bootstrap installed; requesting certificate..."
  certbot --nginx -d "$SITE" --non-interactive --agree-tos -m "$EMAIL" --redirect || {
    echo "WARN: certbot failed (is DNS A/AAAA for ${SITE} pointing at this host?)"
    exit 1
  }
fi

if [[ -f "${ROOT}/nginx-agent.pooli.shop.conf.proposed" ]]; then
  cp "${ROOT}/nginx-agent.pooli.shop.conf.proposed" "$AVAIL"
  nginx -t
  systemctl reload nginx
fi

curl -fsS "https://${SITE}/healthz"
echo
echo "agent nginx OK"
