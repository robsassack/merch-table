#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [[ ! -f infra/garage/garage.toml ]]; then
  echo "Missing infra/garage/garage.toml. Copy the template first:" >&2
  echo "  cp infra/garage/garage.toml.example infra/garage/garage.toml" >&2
  exit 1
fi

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

STORAGE_BUCKET="${STORAGE_BUCKET:-media}"
STORAGE_ACCESS_KEY_ID="${STORAGE_ACCESS_KEY_ID:-access-key-id}"
STORAGE_SECRET_ACCESS_KEY="${STORAGE_SECRET_ACCESS_KEY:-secret-access-key}"

garage() {
  docker compose exec -T garage /garage -c /etc/garage.toml "$@"
}

for attempt in {1..60}; do
  if garage status >/dev/null 2>&1; then
    break
  fi

  if [[ "$attempt" -eq 60 ]]; then
    echo "Garage did not become ready in time." >&2
    exit 1
  fi

  sleep 1
done

NODE_ID="$(garage node id 2>/dev/null | awk -F'@' '/^[0-9a-f]{64}@/ { print $1 }' | tail -n 1)"
if [[ -z "$NODE_ID" ]]; then
  echo "Could not resolve Garage node ID." >&2
  exit 1
fi

garage layout assign -z local -c 1G "$NODE_ID" >/dev/null 2>&1 || true
garage layout apply --version 1 >/dev/null 2>&1 || true

if ! garage key import --yes -n merchtable-app-key "$STORAGE_ACCESS_KEY_ID" "$STORAGE_SECRET_ACCESS_KEY" >/dev/null 2>&1; then
  garage key info merchtable-app-key >/dev/null 2>&1
fi

garage bucket create "$STORAGE_BUCKET" >/dev/null 2>&1 || true
garage bucket allow --read --write --owner "$STORAGE_BUCKET" --key merchtable-app-key >/dev/null 2>&1 || true

echo "Garage bootstrap complete: bucket '$STORAGE_BUCKET' and key 'merchtable-app-key' are ready."
