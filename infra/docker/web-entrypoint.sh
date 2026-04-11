#!/bin/sh
set -eu

echo "[web] applying database migrations (prisma migrate deploy)..."
npm run -s db:deploy

echo "[web] starting Next.js server..."
exec npm run -s start -- --hostname 0.0.0.0 --port "${PORT:-3000}"
