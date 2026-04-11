#
# syntax=docker/dockerfile:1.7
#
FROM mwader/static-ffmpeg:7.1.1 AS ffmpeg

FROM node:22-bookworm-slim

WORKDIR /app
ARG DATABASE_URL=postgresql://postgres:postgres@postgres:5432/merchtable?schema=public
ENV DATABASE_URL=$DATABASE_URL
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
ENV NPM_CONFIG_PROGRESS=false

COPY package.json package-lock.json ./
RUN --mount=type=cache,id=merchtable-worker-npm,target=/root/.npm,sharing=locked \
    npm install --no-audit --no-fund --prefer-online \
      --fetch-retries=2 \
      --fetch-retry-factor=2 \
      --fetch-retry-mintimeout=5000 \
      --fetch-retry-maxtimeout=30000 \
      --fetch-timeout=60000

COPY tsconfig.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src

RUN npm run -s db:generate
ENV NODE_ENV=production

COPY --from=ffmpeg /ffmpeg /usr/local/bin/ffmpeg
COPY --from=ffmpeg /ffprobe /usr/local/bin/ffprobe
RUN chmod +x /usr/local/bin/ffmpeg /usr/local/bin/ffprobe

CMD ["npm", "run", "-s", "worker"]
