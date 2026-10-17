# Hostinger production compose

Copy `.env` from repo `.env.example` (never commit secrets). TLS/nginx samples: `nginx-*.conf.proposed`.

## Deploy from laptop (when `/opt/pooli` is not a git clone)

```bash
rsync -az --delete \
  --exclude node_modules --exclude .next --exclude .git \
  --exclude uploads --exclude deploy/hostinger/.env \
  ./ root@YOUR_HOST:/opt/pooli/

ssh root@YOUR_HOST 'bash /opt/pooli/deploy/hostinger/deploy-web.sh'
ssh root@YOUR_HOST 'bash /opt/pooli/deploy/hostinger/deploy-chain-worker.sh'
```

## One-time: turn `/opt/pooli` into a git clone

On the VPS (backs up `.env`, archives the old tree):

```bash
bash /opt/pooli/deploy/hostinger/setup-git-clone.sh
```

After that, `deploy-web.sh` / `deploy-chain-worker.sh` run `git pull` automatically.

## Deploy on server (after `git clone` into `/opt/pooli`)

```bash
bash /opt/pooli/deploy/hostinger/deploy-web.sh
bash /opt/pooli/deploy/hostinger/deploy-chain-worker.sh
```

`NEXT_PUBLIC_*` values for the web image must be set in `deploy/hostinger/.env` **before** `docker compose build pooli-web`.

## Action gateway

1. Set in `deploy/hostinger/.env`:
   - `AGENT_GATEWAY_SECRET` (long random; same on API + gateway)
   - `ACTION_GATEWAY_PUBLIC_URL=https://agent.pooli.shop`
   - `NEXT_PUBLIC_ACTION_GATEWAY_URL=https://agent.pooli.shop`
   - `ANTHROPIC_API_KEY` (merchant **Suggest follow-up (Claude)** on order detail; API calls Messages API then gateway propose)
   - Optional: `ANTHROPIC_MODEL` (default in `.env.example`)
2. DNS: `A` record `agent` → your VPS IPv4 (same as `pooli.shop`).
3. Enable nginx: `bash /opt/pooli/deploy/hostinger/install-agent-nginx.sh` (HTTP bootstrap + certbot + SSL vhost).
4. Build and start: `docker compose build pooli-action-gateway pooli-web && docker compose up -d pooli-action-gateway`.
5. Health: `curl -fsS http://127.0.0.1:8280/healthz`

`./scripts/deploy-hostinger.sh` builds and waits on API, worker, gateway, and web together.
