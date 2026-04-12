#
# syntax=docker/dockerfile:1.7
#
FROM node:22-bookworm-slim AS deps
WORKDIR /app
ARG DATABASE_URL=postgresql://postgres:postgres@postgres:5432/merchtable?schema=public
ENV DATABASE_URL=$DATABASE_URL
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
ENV NPM_CONFIG_PROGRESS=false
COPY package.json package-lock.json ./
RUN --mount=type=cache,id=merchtable-web-npm,target=/root/.npm,sharing=locked \
    npm install --no-audit --no-fund --prefer-online \
      --fetch-retries=2 \
      --fetch-retry-factor=2 \
      --fetch-retry-mintimeout=5000 \
      --fetch-retry-maxtimeout=30000 \
      --fetch-timeout=60000

FROM deps AS builder
WORKDIR /app
ARG DATABASE_URL=postgresql://postgres:postgres@postgres:5432/merchtable?schema=public
ENV DATABASE_URL=$DATABASE_URL
COPY . .
RUN npm run -s build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/infra/docker/web-entrypoint.sh /usr/local/bin/web-entrypoint.sh

RUN chmod +x /usr/local/bin/web-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/web-entrypoint.sh"]
