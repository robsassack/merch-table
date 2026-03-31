# Merch Table

Merch Table is a Next.js + Prisma app for running a digital music storefront.

## Prerequisites

- Node.js 22+
- npm 10+
- Docker 24+ (recommended for local Postgres + Garage)
- PostgreSQL 15+ (local install or Docker)

## Initial Setup

1. Install dependencies:

```bash
npm install
```

2. Copy env file:

```bash
cp .env.example .env
```

3. Copy local Garage config from template:

```bash
cp infra/garage/garage.toml.example infra/garage/garage.toml
```

4. Generate Garage secrets/tokens (recommended before first run):

```bash
RPC_SECRET="$(openssl rand -hex 32)"
ADMIN_TOKEN="$(openssl rand -base64 32)"
METRICS_TOKEN="$(openssl rand -base64 32)"

sed -i \
  -e "s|^rpc_secret = .*|rpc_secret = \"$RPC_SECRET\"|" \
  -e "s|^admin_token = .*|admin_token = \"$ADMIN_TOKEN\"|" \
  -e "s|^metrics_token = .*|metrics_token = \"$METRICS_TOKEN\"|" \
  infra/garage/garage.toml
```

5. (Recommended) set storage credentials in `.env` (must match what bootstrap will import):

```bash
sed -i \
  -e 's|^STORAGE_ACCESS_KEY_ID=.*|STORAGE_ACCESS_KEY_ID="your-access-key-id"|' \
  -e 's|^STORAGE_SECRET_ACCESS_KEY=.*|STORAGE_SECRET_ACCESS_KEY="your-secret-access-key"|' \
  .env
```

6. Update at least these values in `.env`:
- `DATABASE_URL`
- `AUTH_SECRET` (generate one with `openssl rand -base64 32`)
- `APP_ENCRYPTION_KEY` (generate one with `openssl rand -base64 32 | tr '+/' '-_' | tr -d '='`)

## Database Quickstart

This project is Docker-first. Start with Docker Postgres unless you already run Postgres locally.

### Option A: Docker Compose (recommended)

```bash
docker compose up -d postgres redis garage
```

Equivalent npm script:

```bash
npm run infra:up
```

If you start services with plain `docker compose` commands, run this once after `garage` is up:

```bash
npm run infra:garage:bootstrap
```

Use this URL in `.env`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/merchtable?schema=public"
```

Check service status:

```bash
docker compose ps
```

To start all services (including the `web` stub and transcode `worker`):

```bash
npm run infra:up:all
```

## Primary Scripts

```bash
npm run dev             # Next.js app
npm run worker          # transcode worker (uses .env)
npm run infra:up        # postgres + redis + garage + garage bootstrap
npm run infra:up:web    # web stub + worker container
npm run infra:down      # stop/remove compose stack
npm run infra:ps        # compose service status
npm run check           # db validate + lint + typecheck + tests
```

## Additional Scripts

```bash
npm run db:generate
npm run db:validate
npm run db:status
npm run db:migrate
npm run db:deploy
npm run db:studio
npm run infra:garage:bootstrap
npm run infra:up:all
npm run infra:up:core   # compatibility alias for infra:up
npm run stripe:listen
npm run stripe:trigger:checkout-complete
```

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

### Bundled Garage Notes

- Docker Compose runs Garage from `infra/garage/garage.toml`.
- A template is tracked at `infra/garage/garage.toml.example`; your local `garage.toml` is ignored by git.
- The template intentionally uses placeholder token values; replace them before use.
- `npm run infra:up`, `npm run infra:up:core`, and `npm run infra:up:all` automatically run `scripts/bootstrap-garage.sh` after containers start.
- The bootstrap script initializes a single-node layout, imports the S3 API key from `STORAGE_ACCESS_KEY_ID` / `STORAGE_SECRET_ACCESS_KEY`, creates `STORAGE_BUCKET`, and grants key access to that bucket.
- If you override the default key pair, use a Garage-compatible key ID + secret pair.

## Docker Networking Note

- Use `localhost` in `.env` when running the Next.js app directly on your host machine.
- Use Docker service names when one container talks to another (for example `postgres`, `redis`, `garage` instead of `localhost`).

### Option B: Local Postgres

1. Create database:

```sql
CREATE DATABASE merchtable;
```

2. Ensure `.env` points at your local database:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/merchtable?schema=public"
```

## Apply Prisma Migrations

Run these from the project root:

```bash
npx prisma validate
npx prisma migrate status
npx prisma migrate dev
```

If you only want to apply existing migrations (without creating new ones), use:

```bash
npx prisma migrate deploy
```

## Verify DB Connectivity

```bash
npx prisma migrate status
```

If this command succeeds and shows your migration state, your database connection is working.

## Testing & CI

Run local checks:

```bash
npm run check
npm run -s build
```

`npm test` uses Node's built-in test runner with tsx:

```bash
node --import tsx --test "src/**/*.test.ts"
```

GitHub Actions CI runs the same quality checks on:
- every pull request
- pushes to `main`

## Troubleshooting

If you see a container name conflict (for example `merchtable-postgres is already in use`), remove old standalone containers from earlier `docker run` commands:

```bash
docker rm -f merchtable-postgres merchtable-redis merchtable-garage
```

## Run the App

```bash
npm run dev
```

Open `http://localhost:3000`.

## First-Run Setup Wizard

After app startup, complete setup at `/setup`.

- If no admin exists yet, the server logs a bootstrap setup link and token:
  - `[bootstrap] SETUP LINK: ...`
  - `[bootstrap] SETUP TOKEN: ...`
- Use the link (or paste the token on `/setup`) to unlock the wizard.
- Token is single-use and expires after 30 minutes.

### Wizard Steps Implemented

- Step 1: Store basics (org name, store name, contact email, currency)
- Step 2: Email config (SMTP + send test email gate)
- Step 3: Storage (Bundled Garage or External S3-compatible provider, with validation gate for external)
- Step 4: Stripe (secret key + webhook secret + verify connection)
- Step 5: Admin account (admin email + send first one-time magic-link via Step 2 SMTP; opening the link finalizes setup and redirects to `/admin`)

Setup secret handling:
- SMTP password, storage secret access key, Stripe secret key, and Stripe webhook secret are encrypted at rest in `SetupWizardState`.
- Existing plaintext values from older local DB rows are still readable and are re-saved encrypted on next save.

Setup API security:
- State-changing setup endpoints enforce origin-based CSRF checks (`Origin` / `Sec-Fetch-Site`).
- Setup endpoints also have rate limits (claim token, save steps, SMTP/storage/Stripe verification, admin magic-link send).
- If `REDIS_URL` is configured, limits are enforced in Redis across instances. If Redis is unavailable, the app falls back to in-memory buckets.
- You can tune these with `RATE_LIMIT_SETUP_*` env vars in `.env`.
- External provider errors returned by setup APIs are sanitized before being stored/displayed.
- Default security headers are applied globally (for example `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`).

Store status behavior:
- `SETUP`: routes redirect to `/setup` (except setup/magic-link completion paths).
- `PRIVATE`: admin routes are accessible; public visitors are redirected to `/coming-soon`.
- `PUBLIC`: storefront routes are fully live.

Notes for Step 5:
- The magic-link email sends to the admin email entered in the wizard.
- Link target is `${APP_BASE_URL}/admin/auth/magic-link#token=...`.
- Token expiry is 30 minutes and each send creates a new one-time token.
- After setup is complete, admins can request new sign-in links at `/admin/auth`.
- If SMTP is misconfigured on first deploy, Step 5 includes a bootstrap-token fallback path.

If you pull new changes and setup pages start failing with missing columns, run migrations again:

```bash
npx prisma migrate dev
npx prisma generate
```

## Stripe Local Webhook Testing

Run Stripe CLI forwarding in a second terminal while `npm run dev` is running:

```bash
npm run stripe:listen
```

Trigger a test checkout completion event:

```bash
npm run stripe:trigger:checkout-complete
```

If your app runs on a different port (for example `3001`), run Stripe CLI directly with that port:

```bash
stripe listen --forward-to localhost:3001/api/webhooks/stripe
```
