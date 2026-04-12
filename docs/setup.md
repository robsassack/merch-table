# Local Development

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

3. Choose storage mode:

- Bundled Garage (default): copy local Garage config from template:

```bash
cp infra/garage/garage.toml.example infra/garage/garage.toml
```

- External S3-compatible storage: skip `garage.toml` and set these in `.env`:
  - `STORAGE_MODE="S3"`
  - `STORAGE_BUCKET`
  - `STORAGE_REGION`
  - `STORAGE_ENDPOINT` (optional for AWS S3, required for S3-compatible providers)
  - `STORAGE_ACCESS_KEY_ID`
  - `STORAGE_SECRET_ACCESS_KEY`
  - `STORAGE_USE_PATH_STYLE` (`false` for AWS S3, often `true` for some compatible providers)

4. If using bundled Garage, generate Garage secrets/tokens (recommended before first run):

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

5. Set storage credentials in `.env`:

- For bundled Garage, credentials must match what Garage bootstrap imports.
- For external S3-compatible storage, credentials must match your bucket provider.

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

### Option A: Docker Compose

Fastest path for a full container startup (runtime/integration validation):

```bash
npm run infra:up:all
```

Manual equivalent:

```bash
docker compose up -d
npm run infra:garage:bootstrap
```

First-run timing note:
- A cold first build (image pulls + dependency install + app build) commonly takes 8-20 minutes.
- On slower hardware or networks, first startup can take 20-35 minutes.
- Subsequent rebuilds are usually much faster due to Docker layer caching.

Core services only (without `web`/`worker`, plus Garage bootstrap):

```bash
npm run infra:up
```

Use this URL in `.env`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/merchtable?schema=public"
```

Check service status:

```bash
docker compose ps
```

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

Docker deployment note:
- The `web` container entrypoint runs `prisma migrate deploy` before `next start`.
- If migrations fail, the `web` container exits non-zero.

## Verify DB Connectivity

```bash
npx prisma migrate status
```

If this command succeeds and shows your migration state, your database connection is working.

## SMTP Provider Recommendations

Use a transactional email provider for production delivery.

- Some options: Resend, Postmark, Amazon SES, Gmail

For this project:

- Set `EMAIL_PROVIDER="resend"` in `.env`
- Configure `RESEND_API_KEY` and `RESEND_FROM_EMAIL`
- Keep SMTP credentials configured if you want the setup wizard SMTP test flow and/or SMTP-based sending paths

## SPF And DKIM (Deliverability)

Before going live, configure SPF and DKIM for your sender domain in DNS.

- SPF authorizes your email provider to send mail for your domain.
- DKIM signs outgoing mail so receiving servers can verify authenticity.

Without SPF/DKIM, delivery quality is often poor (spam placement, throttling, or rejection).
Follow your provider's domain-authentication guide (Resend/Postmark/Amazon SES) and verify domain status before production sends.

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

For active development (recommended), run the app on the host for hot reload:

```bash
npm run dev
```

Open `http://localhost:3000`.

For full container validation instead, run:

```bash
npm run infra:up:all
```
