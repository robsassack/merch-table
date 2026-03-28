# Merch Table

Merch Table is a Next.js + Prisma app for running a digital music storefront.

## Prerequisites

- Node.js 22+
- npm 10+
- Docker 24+ (recommended for local Postgres)
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

3. Update at least these values in `.env`:
- `DATABASE_URL`
- `AUTH_SECRET` (generate one with `openssl rand -base64 32`)
- `APP_ENCRYPTION_KEY` (generate one with `openssl rand -base64 32 | tr '+/' '-_' | tr -d '='`)

## Database Quickstart

This project is Docker-first. Start with Docker Postgres unless you already run Postgres locally.

### Option A: Docker Compose (recommended)

```bash
docker compose up -d postgres redis minio
```

Equivalent npm script:

```bash
npm run infra:up:core
```

Use this URL in `.env`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/merchtable?schema=public"
```

Check service status:

```bash
docker compose ps
```

To start all services (including `web` and `worker` stubs):

```bash
npm run infra:up:all
```

## Infra Scripts

```bash
npm run infra:up        # core services (postgres, redis, minio)
npm run infra:up:core   # same as infra:up
npm run infra:up:web    # web + worker stubs
npm run infra:up:all    # all services
npm run infra:ps        # docker compose ps
npm run infra:down      # stop and remove stack
```

## Docker Networking Note

- Use `localhost` in `.env` when running the Next.js app directly on your host machine.
- Use Docker service names when one container talks to another (for example `postgres`, `redis`, `minio` instead of `localhost`).

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

## Troubleshooting

If you see a container name conflict (for example `merchtable-postgres is already in use`), remove old standalone containers from earlier `docker run` commands:

```bash
docker rm -f merchtable-postgres merchtable-redis merchtable-minio
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
- Step 3: Storage (Bundled MinIO or External S3, with validation gate for external)
- Step 4: Stripe (secret key + webhook secret + verify connection)
- Step 5: Admin account (admin email + send first one-time magic-link via Step 2 SMTP; opening the link finalizes setup and redirects to `/admin`)

Setup secret handling:
- SMTP password, storage secret access key, Stripe secret key, and Stripe webhook secret are encrypted at rest in `SetupWizardState`.
- Existing plaintext values from older local DB rows are still readable and are re-saved encrypted on next save.

Setup API security:
- State-changing setup endpoints enforce origin-based CSRF checks (`Origin` / `Sec-Fetch-Site`).
- Setup endpoints also have per-IP in-memory rate limits (claim token, save steps, SMTP/storage/Stripe verification, admin magic-link send).
- You can tune these with `RATE_LIMIT_SETUP_*` env vars in `.env`.
- External provider errors returned by setup APIs are sanitized before being stored/displayed.
- Default security headers are applied globally (for example `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`).

Notes for Step 5:
- The magic-link email sends to the admin email entered in the wizard.
- Link target is `${APP_BASE_URL}/admin/auth/magic-link?token=...`.
- Token expiry is 30 minutes and each send creates a new one-time token.

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
