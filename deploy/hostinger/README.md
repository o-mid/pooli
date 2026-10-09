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

## Deploy on server (after `git clone` into `/opt/pooli`)

```bash
bash /opt/pooli/deploy/hostinger/deploy-web.sh
bash /opt/pooli/deploy/hostinger/deploy-chain-worker.sh
```

`NEXT_PUBLIC_*` values for the web image must be set in `deploy/hostinger/.env` **before** `docker compose build pooli-web`.
