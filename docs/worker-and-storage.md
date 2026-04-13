# Worker and Storage

## Transcode Worker

- Uploading a master track queues transcode work in Redis (`TranscodeJob` starts as `QUEUED`).
- A worker process must be running to move jobs to `RUNNING`/`SUCCEEDED` and create preview/delivery assets.
- Delivery transcodes honor per-release format settings (`MP3`, `M4A`, `FLAC`), with all three enabled by default for new releases.
- Worker 1 periodically scans for stale `QUEUED` jobs older than `TRANSCODE_STALE_QUEUED_THRESHOLD_SECONDS` (default `900`) and either re-queues them or marks them `FAILED` with an actionable reason when kind inference is unsafe.
- Tune stale recovery cadence with `TRANSCODE_STALE_RECOVERY_INTERVAL_SECONDS` (default `30`) and `TRANSCODE_STALE_RECOVERY_BATCH_SIZE` (default `25`).
- If jobs stay queued:
  - Start worker locally: `npm run worker`
  - Or run Docker worker: `docker compose up -d --build worker`
  - Check worker logs: `docker compose logs -f worker`
- Docker worker image includes static `ffmpeg`/`ffprobe` binaries (no host mounts needed).

## Bundled Garage Notes

- Docker Compose runs Garage from `infra/garage/garage.toml`.
- A template is tracked at `infra/garage/garage.toml.example`; your local `garage.toml` is ignored by git.
- The template intentionally uses placeholder token values; replace them before use.
- Run `bash ./scripts/bootstrap-garage.sh` after Garage starts to initialize layout, key, and bucket.
- `npm run infra:garage:bootstrap` is still available as a wrapper for the same recovery utility.
- The bootstrap script initializes a single-node layout, imports the S3 API key from `STORAGE_ACCESS_KEY_ID` / `STORAGE_SECRET_ACCESS_KEY`, creates `STORAGE_BUCKET`, and grants key access to that bucket.
- Garage v2.x credential format requirements:
  - `STORAGE_ACCESS_KEY_ID` must start with `GK` followed by 24 hex chars.
  - `STORAGE_SECRET_ACCESS_KEY` must be 64 hex chars.
- Common failure clues:
  - `No such key ...` in Garage logs means the app key was not imported/granted.
  - `Invalid key format` means `STORAGE_ACCESS_KEY_ID` or `STORAGE_SECRET_ACCESS_KEY` format is wrong.

## Docker Networking Note

- Use `localhost` in `.env` when running the Next.js app directly on your host machine.
- Use Docker service names when one container talks to another (for example `postgres`, `redis`, `garage` instead of `localhost`).

Compose networking reference:
- Keep host-run app values like `DATABASE_URL=...localhost...` and `REDIS_URL=...localhost...` for `npm run dev`.
- Containers use service-name URLs by default (`postgres`, `redis`, `garage`) via `DOCKER_DATABASE_URL`, `DOCKER_REDIS_URL`, and `DOCKER_STORAGE_ENDPOINT`.

## Hosted Same-Domain Uploads (Caddy)

If your public app URL is HTTPS and Garage uploads go through the same domain, route `/media/*` to Garage:

```caddy
merch-table.example.com {
    handle /media/* {
        reverse_proxy 127.0.0.1:3900
    }

    handle {
        reverse_proxy 127.0.0.1:3000
    }
}
```

Important:

- Use `handle` (not `handle_path`) for `/media/*`; path stripping can break presigned S3 URL signatures.
- Set `DOCKER_STORAGE_ENDPOINT` to your public app domain URL and keep `STORAGE_USE_PATH_STYLE=true`.

## Recovery Playbook (Garage)

Use this quick map when storage checks fail.

- Symptom: `/api/health/ready` shows `storage.reachable=false` and `error="UnknownError"`
  - Check Garage logs: `docker compose logs --tail=120 garage`
  - Check runtime storage env: `docker compose exec -T web sh -lc 'echo STORAGE_ENDPOINT=$STORAGE_ENDPOINT; echo STORAGE_BUCKET=$STORAGE_BUCKET; echo STORAGE_ACCESS_KEY_ID=$STORAGE_ACCESS_KEY_ID; echo STORAGE_USE_PATH_STYLE=$STORAGE_USE_PATH_STYLE'`
- Symptom: `Layout not ready` from Garage admin commands
  - Re-stage and apply layout:
    - `docker compose exec -T garage /garage -c /etc/garage.toml node id`
    - `docker compose exec -T garage /garage -c /etc/garage.toml layout assign -z local -c 1G <NODE_ID>`
    - `docker compose exec -T garage /garage -c /etc/garage.toml layout show`
    - If current layout version is `N`, run `docker compose exec -T garage /garage -c /etc/garage.toml layout apply --version N+1`
- Symptom: `No such key ...` in Garage logs
  - Re-import key and re-grant bucket access:
    - `set -a; source .env; set +a`
    - `docker compose exec -T garage /garage -c /etc/garage.toml key import --yes -n merchtable-app-key "$STORAGE_ACCESS_KEY_ID" "$STORAGE_SECRET_ACCESS_KEY"`
    - `docker compose exec -T garage /garage -c /etc/garage.toml bucket create "$STORAGE_BUCKET"`
    - `docker compose exec -T garage /garage -c /etc/garage.toml bucket allow --read --write --owner "$STORAGE_BUCKET" --key merchtable-app-key`
- Symptom: `Invalid key format`
  - Use Garage v2.x-compatible credentials:
    - `STORAGE_ACCESS_KEY_ID`: `GK` + 24 hex chars
    - `STORAGE_SECRET_ACCESS_KEY`: 64 hex chars
- Symptom: Browser upload `NetworkError when attempting to fetch resource`
  - Hosted same-domain fix:
    - `DOCKER_STORAGE_ENDPOINT="https://<your-app-domain>"`
    - `STORAGE_USE_PATH_STYLE="true"`
    - Caddy route `/media/*` with `handle`, not `handle_path`

After any `.env` change, recreate app containers:

```bash
docker compose up -d --force-recreate web worker
```

Final verification:

```bash
docker compose exec -T garage /garage -c /etc/garage.toml key info merchtable-app-key
docker compose exec -T garage /garage -c /etc/garage.toml bucket list
curl -s http://127.0.0.1:3000/api/health/ready
```
