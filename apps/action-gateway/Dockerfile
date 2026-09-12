# syntax=docker/dockerfile:1
FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# TypeScript is a build-time dependency only; the runtime image runs plain JS.
COPY tsconfig.json ./
COPY src ./src
RUN npm install --no-save typescript@5 && ./node_modules/.bin/tsc && rm -rf node_modules/typescript

COPY oauth.mjs server.mjs ./

# OAuth state -- signing key, client registrations, refresh tokens -- lives on
# the mounted volume, NOT in the image. That is what lets this container
# replace its predecessor without AIFindr having to reconnect.
ENV OAUTH_STATE_DIR=/data
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# Unprivileged. Note the consequence, learned the hard way: /app is root-owned,
# so nothing at runtime may write beside the source. Diagnostics go to /data.
USER node

CMD ["node", "server.mjs"]
