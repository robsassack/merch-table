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
- Run `npm run infra:garage:bootstrap` after Garage starts to initialize layout, key, and bucket.
- `npm run infra:garage:bootstrap` is still available as a manual recovery utility.
- The bootstrap script initializes a single-node layout, imports the S3 API key from `STORAGE_ACCESS_KEY_ID` / `STORAGE_SECRET_ACCESS_KEY`, creates `STORAGE_BUCKET`, and grants key access to that bucket.
- If you override the default key pair, use a Garage-compatible key ID + secret pair.

## Docker Networking Note

- Use `localhost` in `.env` when running the Next.js app directly on your host machine.
- Use Docker service names when one container talks to another (for example `postgres`, `redis`, `garage` instead of `localhost`).

Compose networking reference:
- Keep host-run app values like `DATABASE_URL=...localhost...` and `REDIS_URL=...localhost...` for `npm run dev`.
- Containers use service-name URLs by default (`postgres`, `redis`, `garage`) via `DOCKER_DATABASE_URL`, `DOCKER_REDIS_URL`, and `DOCKER_STORAGE_ENDPOINT`.
