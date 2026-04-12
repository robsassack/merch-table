# Environment Variables Reference

This file is the canonical reference for runtime environment variables.

- Source of defaults: [`.env.example`](../.env.example)
- Local setup flow: [`docs/setup.md`](./setup.md)

## How To Use

1. Copy `.env.example` to `.env`.
2. Update required secrets and provider credentials before running in production.
3. Keep `.env.example` and this document in sync whenever env behavior changes.

## Required In Practice

These should be explicitly set for real deployments:

- `DATABASE_URL`: Postgres connection string.
- `AUTH_SECRET`: Better Auth signing secret.
- `APP_ENCRYPTION_KEY`: 32-byte base64url key for encrypting stored setup secrets.
- `APP_BASE_URL`: Public base URL used in links (for example magic-link emails).
- `STRIPE_SECRET_KEY`: Stripe API secret key.
- `STRIPE_WEBHOOK_SECRET`: Stripe webhook signing secret.
- `EMAIL_PROVIDER`: `resend` or `mock` (use `resend` outside tests).
- `STORAGE_MODE`: `GARAGE` (bundled default) or `S3`.
- `STORAGE_BUCKET`: Object storage bucket name.
- `STORAGE_REGION`: Object storage region string.
- `STORAGE_ACCESS_KEY_ID`: Object storage access key.
- `STORAGE_SECRET_ACCESS_KEY`: Object storage secret key.
- `REDIS_URL`: Redis connection string for queueing/rate limiting.

## Core App

- `DATABASE_URL` (default: `postgresql://postgres:postgres@localhost:5432/merchtable?schema=public`): Prisma/Postgres connection URL.
- `AUTH_SECRET` (no safe default): Auth/session secret.
- `APP_ENCRYPTION_KEY` (no safe default): key used for app-level encryption at rest.
- `APP_BASE_URL` (default: `http://localhost:3000`): absolute base URL for generated links.
- `STORE_ORG_SLUG` (default: `main-store`): fallback organization slug for single-org bootstrapping.
- `EMAIL_PROVIDER` (default: `resend`): active email provider (`resend` or `mock`).
- `RESEND_API_KEY` (default: empty): Resend API key.
- `RESEND_FROM_EMAIL` (default: empty): sender override for Resend.

## Stripe

- `STRIPE_SECRET_KEY` (default: empty): Stripe secret key used for Checkout/session creation.
- `STRIPE_WEBHOOK_SECRET` (default: empty): webhook signature verification secret.
- `STRIPE_CURRENCY` (default: `USD`): legacy/default currency value (store settings may override runtime behavior).
- `STRIPE_VERIFY_TIMEOUT_MS` (default: `15000`): setup wizard Stripe verification timeout in milliseconds.

## SMTP (Admin Magic-Link Emails)

- `SMTP_FROM` (default: `no-reply@example.com`): sender address.
- `SMTP_HOST` (default: `localhost`): SMTP host.
- `SMTP_PORT` (default: `1025`): SMTP port.
- `SMTP_USER` (default: empty): SMTP username.
- `SMTP_PASSWORD` (default: empty): SMTP password.
- `SMTP_SECURE` (default: `false`): use SMTPS (`true`) vs STARTTLS/plain (`false`).

## Storage

- `STORAGE_MODE` (default: `GARAGE`): storage provider mode (`GARAGE` or `S3`).
- `STORAGE_BUCKET` (default: `media`): media bucket.
- `STORAGE_PUBLIC_BASE_URL` (default: `http://localhost:3900/media`): public base for storage-backed URLs when needed.
- `STORAGE_ENDPOINT` (default: `http://localhost:3900`): custom endpoint (required for most S3-compatible providers; often omitted for AWS S3).
- `STORAGE_REGION` (default: `us-east-1`): storage region.
- `STORAGE_ACCESS_KEY_ID` (default: `access-key-id`): access key id.
- `STORAGE_SECRET_ACCESS_KEY` (default: `secret-access-key`): access key secret.
- `STORAGE_USE_PATH_STYLE` (default: `true`): S3 path-style addressing toggle.
- `GARAGE_ENABLED` (default: `true`): legacy toggle only used when `STORAGE_MODE` is unset.
- `MINIO_ENABLED` (default: `true`): legacy toggle retained for backward compatibility.

## Worker Runtime And Transcode

- `REDIS_URL` (default: `redis://localhost:6379`): Redis for queue + distributed rate limiting.
- `CDN_BASE_URL` (default: empty): optional CDN origin/base URL used for media URL resolution.
- `TRANSCODE_CONCURRENCY` (default: `1`): number of concurrent worker loops.
- `TRANSCODE_QUEUE_KEY` (default: `merch-table:transcode:queue`): Redis list key for transcode messages.
- `TRANSCODE_QUEUE_POLL_TIMEOUT_SECONDS` (default: `5`): queue blocking-pop timeout.
- `TRANSCODE_WORKER_HEARTBEAT_KEY` (default: `merch-table:transcode:worker:heartbeat`): Redis key for worker heartbeat timestamp.
- `TRANSCODE_WORKER_HEARTBEAT_TTL_SECONDS` (default: `30`): heartbeat key TTL.
- `TRANSCODE_WORKER_HEARTBEAT_INTERVAL_SECONDS` (default: `10`): heartbeat publish cadence.
- `TRANSCODE_SOURCE_ROOT` (default: `/tmp/merch-table/source`): local workspace root for downloaded source files.
- `TRANSCODE_OUTPUT_ROOT` (default: `/tmp/merch-table/output`): local workspace root for generated outputs.
- `TRANSCODE_STALE_QUEUED_THRESHOLD_SECONDS` (default: `300`): age threshold for queued-job stale detection.
- `TRANSCODE_STALE_RUNNING_THRESHOLD_SECONDS` (default: `1800`): age threshold for running-job stale detection.
- `TRANSCODE_STALE_RECOVERY_INTERVAL_SECONDS` (default: `30`): interval for stale-job recovery scans.
- `TRANSCODE_STALE_RECOVERY_BATCH_SIZE` (default: `25`): queued-job stale recovery batch size.
- `TRANSCODE_STALE_RUNNING_RECOVERY_BATCH_SIZE` (default: `10`): running-job stale recovery batch size.
- `TRANSCODE_RETRY_ENQUEUE_INTERVAL_SECONDS` (default: `30`): retry sweep interval for transient failures.
- `TRANSCODE_RETRY_ENQUEUE_BATCH_SIZE` (default: `25`): retry enqueue batch size per sweep.
- `TRANSCODE_WORKER_HEARTBEAT_STALE_AFTER_SECONDS` (default: `45`): admin status threshold for reporting worker as down.

## Upload, Download, And Buyer Library

- `MAX_UPLOAD_SIZE_BYTES` (default: `2147483648`): max direct upload size (2 GB).
- `MAX_COVER_UPLOAD_SIZE_BYTES` (default: `26214400`): max cover upload size (25 MB).
- `SIGNED_URL_EXPIRY_SECONDS` (default: `900`): signed download URL TTL.
- `NEXT_PUBLIC_MIN_UPLOAD_BITRATE_KBPS` (default: `192`): client validation floor for bitrate.
- `NEXT_PUBLIC_MIN_UPLOAD_SAMPLE_RATE_HZ` (default: `44100`): client validation floor for sample rate.
- `NEXT_PUBLIC_UPLOAD_QUALITY_MODE` (default: `warn`): client quality policy mode.
- `BUYER_LIBRARY_TOKEN_TTL_SECONDS` (default: empty): buyer library token TTL in seconds; empty means non-expiring.

## Pricing And Currency Conversion

- `MINIMUM_PRICE_FLOOR_CENTS` (default: `50`): global minimum price floor in base currency minor units.
- `MINIMUM_PRICE_FLOOR_BASE_CURRENCY` (default: `USD`): base currency for floor conversion.
- `STRIPE_FEE_ESTIMATE_PERCENT_BPS` (default: `290`): default Stripe fee estimate percent in basis points.
- `STRIPE_FEE_ESTIMATE_FIXED_CENTS` (default: `30`): default Stripe fee estimate fixed fee (USD minor units).
- `STRIPE_FEE_ESTIMATE_PERCENT_BPS_JPY` (optional, no default): JPY-specific fee estimate percent override.
- `STRIPE_FEE_ESTIMATE_FIXED_MINOR_JPY` (optional, no default): JPY-specific fixed fee override.
- `EXCHANGE_RATE_API_BASE_URL` (default: `https://api.frankfurter.app`): upstream exchange-rate API base URL.

## Rate Limiting

- `RATE_LIMIT_FREE_CHECKOUT_MAX` / `RATE_LIMIT_FREE_CHECKOUT_WINDOW_SECONDS`
- `RATE_LIMIT_FREE_CHECKOUT_EMAIL_MAX` / `RATE_LIMIT_FREE_CHECKOUT_EMAIL_WINDOW_SECONDS`
- `RATE_LIMIT_LIBRARY_RESEND_MAX` / `RATE_LIMIT_LIBRARY_RESEND_WINDOW_SECONDS`
- `RATE_LIMIT_LIBRARY_RESEND_EMAIL_MAX` / `RATE_LIMIT_LIBRARY_RESEND_EMAIL_WINDOW_SECONDS`
- `RATE_LIMIT_DOWNLOAD_MAX` / `RATE_LIMIT_DOWNLOAD_WINDOW_SECONDS`
- `RATE_LIMIT_UPLOAD_URL_MAX` / `RATE_LIMIT_UPLOAD_URL_WINDOW_SECONDS`
- `RATE_LIMIT_CHECKOUT_SESSION_MAX` / `RATE_LIMIT_CHECKOUT_SESSION_WINDOW_SECONDS`
- `RATE_LIMIT_SETUP_CLAIM_MAX` / `RATE_LIMIT_SETUP_CLAIM_WINDOW_SECONDS`
- `RATE_LIMIT_SETUP_SAVE_MAX` / `RATE_LIMIT_SETUP_SAVE_WINDOW_SECONDS`
- `RATE_LIMIT_SETUP_VERIFY_SMTP_MAX` / `RATE_LIMIT_SETUP_VERIFY_SMTP_WINDOW_SECONDS`
- `RATE_LIMIT_SETUP_VERIFY_STORAGE_MAX` / `RATE_LIMIT_SETUP_VERIFY_STORAGE_WINDOW_SECONDS`
- `RATE_LIMIT_SETUP_VERIFY_STRIPE_MAX` / `RATE_LIMIT_SETUP_VERIFY_STRIPE_WINDOW_SECONDS`
- `RATE_LIMIT_SETUP_ADMIN_MAGIC_LINK_MAX` / `RATE_LIMIT_SETUP_ADMIN_MAGIC_LINK_WINDOW_SECONDS`
- `RATE_LIMIT_ADMIN_AUTH_REQUEST_IP_MAX` / `RATE_LIMIT_ADMIN_AUTH_REQUEST_IP_WINDOW_SECONDS`
- `RATE_LIMIT_ADMIN_AUTH_REQUEST_EMAIL_MAX` / `RATE_LIMIT_ADMIN_AUTH_REQUEST_EMAIL_WINDOW_SECONDS`
- `RATE_LIMIT_ADMIN_AUTH_CONSUME_IP_MAX` / `RATE_LIMIT_ADMIN_AUTH_CONSUME_IP_WINDOW_SECONDS`
- `TRUST_PROXY_HEADERS` (default: `false`): trust forwarded IP headers for rate-limit keying.

## Observability And Admin Status

- `LOG_LEVEL` (default: `info`): app log verbosity.
- `ADMIN_STATUS_FAILED_EMAIL_WINDOW_DAYS` (default: `7`): lookback window for failed email count in admin status.

## Docker Compose Overrides

These are optional commented values in `.env.example` for container-to-container networking:

- `DOCKER_DATABASE_URL`
- `DOCKER_REDIS_URL`
- `DOCKER_STORAGE_ENDPOINT`

## Notes

- System/framework variables like `NODE_ENV`, `NEXT_RUNTIME`, and `PATH` are not app config and are intentionally omitted from `.env.example`.
- Keep secrets out of git. `.env` should remain untracked.
