# Pooli production reliability runbook

Short operational guide for detecting and recovering from web/API/worker outages on Hostinger VPS.

## Host

- SSH: `ssh pooli-vps` (`root@195.110.58.84`)
- App root: `/opt/pooli`
- Compose: `/opt/pooli/deploy/hostinger`

## Quick health

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}'
curl -fsS http://127.0.0.1:8180/healthz
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3100/login
curl -fsS https://api.pooli.shop/api/v1/ops/status | python3 -m json.tool
```

From laptop:

```bash
make smoke-prod
```

## Detect web outage (502 on pooli.shop)

Symptoms: nginx `502 Bad Gateway`, branded “temporarily unavailable” page, or plain nginx error.

1. Check nginx error log:

```bash
tail -n 100 /var/log/nginx/error.log
grep -i 'Connection refused\|upstream' /var/log/nginx/error.log | tail -20
```

Typical signature during deploy gap:

```
connect() failed (111: Connection refused) ... upstream: "http://127.0.0.1:3100/..."
```

2. Inspect web container:

```bash
docker inspect pooli-web --format 'RestartCount={{.RestartCount}} OOM={{.State.OOMKilled}} Status={{.State.Status}}'
docker logs --tail 100 pooli-web
curl -v http://127.0.0.1:3100/login
```

3. Check deployed revision:

```bash
grep GIT_SHA /opt/pooli/deploy/hostinger/.env
curl -fsS https://api.pooli.shop/api/v1/ops/status | jq .git_sha
```

## Detect API outage

```bash
curl -v http://127.0.0.1:8180/healthz
docker logs --tail 100 pooli-api
```

## Detect worker outage

```bash
curl -fsS http://127.0.0.1:8180/api/v1/ops/status | jq .worker
docker logs --tail 100 pooli-chain-worker
```

## Nginx config (pooli.shop)

- Vhost: `/etc/nginx/sites-available/pooli.shop`
- Upgrade map: `/etc/nginx/conf.d/pooli-upgrade-map.conf`
- Error page: `/opt/pooli/deploy/hostinger/static/pooli-unavailable.html`
- Test + reload: `nginx -t && systemctl reload nginx`

Architecture:

```
pooli.shop → nginx → 127.0.0.1:3100 (pooli-web)
/api/v1/merchant/events → nginx → 127.0.0.1:8180 (pooli-api, SSE direct)
api.pooli.shop → nginx → 127.0.0.1:8180 (pooli-api)
```

## Safe restart

```bash
cd /opt/pooli/deploy/hostinger
docker compose up -d --wait pooli-api pooli-web pooli-chain-worker
# wait for web
for i in $(seq 1 30); do curl -fsS http://127.0.0.1:3100/login && break; sleep 2; done
```

Do not restart postgres unless necessary.

## Deploy + verify

From dev machine (after local tests pass):

```bash
./scripts/deploy-hostinger.sh
```

Deploy waits for API + web health and runs `make smoke-prod` before `DEPLOY_OK`.

## Resources

```bash
free -m
df -h /
docker stats --no-stream
```

## Google login Back → 502

Root cause class: nginx cannot reach `:3100` while `pooli-web` is recreating. Not an OAuth bug.

Back from Google re-requests `GET /login`. If web port is down, nginx returns 502.

Fix: web healthcheck, deploy wait for `:3100/login`, branded error page, post-deploy smoke.

OAuth initiation (`/api/v1/auth/google/start`) is safe to revisit (302 to Google). Failures redirect to `/login?error=...`.

## SSE note

Long-lived merchant events SSE is proxied directly to API (`8180`) to avoid Next.js rewrite timeouts. REST/DB remains source of truth; SSE is best-effort.
