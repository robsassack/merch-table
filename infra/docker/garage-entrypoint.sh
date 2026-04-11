#!/bin/sh
set -eu

STORAGE_BUCKET="${STORAGE_BUCKET:-media}"
STORAGE_ACCESS_KEY_ID="${STORAGE_ACCESS_KEY_ID:-access-key-id}"
STORAGE_SECRET_ACCESS_KEY="${STORAGE_SECRET_ACCESS_KEY:-secret-access-key}"

/garage -c /etc/garage.toml server &
GARAGE_PID=$!

cleanup() {
  kill -TERM "$GARAGE_PID" 2>/dev/null || true
  wait "$GARAGE_PID" 2>/dev/null || true
}

trap cleanup INT TERM

for attempt in $(seq 1 60); do
  if /garage -c /etc/garage.toml status >/dev/null 2>&1; then
    break
  fi

  if [ "$attempt" -eq 60 ]; then
    echo "[garage] server did not become ready in time" >&2
    exit 1
  fi

  sleep 1
done

NODE_ID="$(/garage -c /etc/garage.toml node id 2>/dev/null | awk -F'@' '/^[0-9a-f]{64}@/ { print $1 }' | tail -n 1)"
if [ -z "$NODE_ID" ]; then
  echo "[garage] failed to resolve node id" >&2
  exit 1
fi

/garage -c /etc/garage.toml layout assign -z local -c 1G "$NODE_ID" >/dev/null 2>&1 || true
/garage -c /etc/garage.toml layout apply --version 1 >/dev/null 2>&1 || true

if ! /garage -c /etc/garage.toml key import --yes -n merchtable-app-key "$STORAGE_ACCESS_KEY_ID" "$STORAGE_SECRET_ACCESS_KEY" >/dev/null 2>&1; then
  /garage -c /etc/garage.toml key info merchtable-app-key >/dev/null 2>&1
fi

/garage -c /etc/garage.toml bucket create "$STORAGE_BUCKET" >/dev/null 2>&1 || true
/garage -c /etc/garage.toml bucket allow --read --write --owner "$STORAGE_BUCKET" --key merchtable-app-key >/dev/null 2>&1 || true

echo "[garage] bootstrap complete: bucket '$STORAGE_BUCKET' and key 'merchtable-app-key' are ready"

wait "$GARAGE_PID"
