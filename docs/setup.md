# Local Development

## Prerequisites

- Docker 24+
- Node.js 22+ (needed for host dev commands)
- npm 10+ (needed for host dev commands)
- PostgreSQL 15+ (only if you are not using Docker Postgres)

## Quickstart (Docker-First)

This is the recommended path for first boot and demos.

1. Copy env file:

```bash
cp .env.example .env
```

2. Choose storage mode:

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

3. If using bundled Garage, generate Garage secrets/tokens (recommended before first run):

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

4. Set storage credentials in `.env`:

- For bundled Garage, credentials must match what Garage bootstrap imports.
- For external S3-compatible storage, credentials must match your bucket provider.
- `admin_token` and `metrics_token` in `garage.toml` are **not** the S3 app credentials used by this app.
- In this project, Garage S3 credentials come from `.env` values `STORAGE_ACCESS_KEY_ID` and `STORAGE_SECRET_ACCESS_KEY`, and the Garage bootstrap step imports them as key `merchtable-app-key`.
- If you do nothing, defaults are:
  - `STORAGE_ACCESS_KEY_ID="access-key-id"`
  - `STORAGE_SECRET_ACCESS_KEY="secret-access-key"`
- For Garage v2.x, credentials must follow Garage's expected format:
  - `STORAGE_ACCESS_KEY_ID`: starts with `GK` followed by 24 hex chars (26 chars total)
  - `STORAGE_SECRET_ACCESS_KEY`: 64 hex chars (32 bytes)
- Recommended: generate Garage-compatible values:

```bash
STORAGE_ACCESS_KEY_ID_VALUE="GK$(openssl rand -hex 12)"
STORAGE_SECRET_ACCESS_KEY_VALUE="$(openssl rand -hex 32)"

echo "KEY_ID_LEN=${#STORAGE_ACCESS_KEY_ID_VALUE}"         # expected: 26
echo "SECRET_KEY_LEN=${#STORAGE_SECRET_ACCESS_KEY_VALUE}" # expected: 64

sed -i \
  -e "s|^STORAGE_ACCESS_KEY_ID=.*|STORAGE_ACCESS_KEY_ID=\"$STORAGE_ACCESS_KEY_ID_VALUE\"|" \
  -e "s|^STORAGE_SECRET_ACCESS_KEY=.*|STORAGE_SECRET_ACCESS_KEY=\"$STORAGE_SECRET_ACCESS_KEY_VALUE\"|" \
  .env
```

- For bundled Garage, set these values (and keep them aligned with Garage):
  - `STORAGE_MODE="GARAGE"`
  - `STORAGE_ENDPOINT="http://localhost:3900"` (matches Garage `[s3_api].api_bind_addr`)
  - `STORAGE_REGION="us-east-1"` (matches Garage `[s3_api].s3_region`)
  - `STORAGE_ACCESS_KEY_ID="<your-garage-key-id>"` (this is your S3 access key id for Garage, from `.env`)
  - `STORAGE_SECRET_ACCESS_KEY="<your-garage-secret-key>"` (this is your S3 secret key for Garage, from `.env`)
  - `STORAGE_BUCKET="media"` (or your chosen bucket name created in Garage bootstrap)
  - `STORAGE_USE_PATH_STYLE="true"` (recommended for local Garage)

```bash
sed -i \
  -e 's|^STORAGE_ACCESS_KEY_ID=.*|STORAGE_ACCESS_KEY_ID="your-access-key-id"|' \
  -e 's|^STORAGE_SECRET_ACCESS_KEY=.*|STORAGE_SECRET_ACCESS_KEY="your-secret-access-key"|' \
  .env
```

After setting/updating these values, import them into Garage:

```bash
bash ./scripts/bootstrap-garage.sh
```

Optional npm wrapper (same action):

```bash
npm run infra:garage:bootstrap
```

Optional verification:

```bash
docker compose exec -T garage /garage -c /etc/garage.toml key info merchtable-app-key
docker compose exec -T garage /garage -c /etc/garage.toml bucket list
```

If bootstrap/import fails with layout errors, inspect and apply the next layout version:

```bash
docker compose exec -T garage /garage -c /etc/garage.toml layout show
# If current is N, apply N+1
docker compose exec -T garage /garage -c /etc/garage.toml layout apply --version <NEXT_VERSION>
```

5. Update at least these values in `.env`:
- `DATABASE_URL`
- `APP_BASE_URL` (set this to your public app URL, for example `https://store.example.com`)
- `AUTH_SECRET` (generate one with `openssl rand -base64 32`)
- `APP_ENCRYPTION_KEY` (generate one with `openssl rand -base64 32 | tr '+/' '-_' | tr -d '='`)
- `REDIS_PASSWORD` (generate one with `openssl rand -hex 32`)

Production note:

- Do not keep the default Postgres password (`postgres`). Use a strong password and set it consistently in both Postgres and `DATABASE_URL`.

For hosted deployments, also review these URL/domain-related values:

- `STORAGE_PUBLIC_BASE_URL` (public media URL base; do not leave `localhost` in production)
- `STORAGE_ENDPOINT` (used by host-run app; keep local Garage endpoint only for local/dev)
- `DOCKER_STORAGE_ENDPOINT` (used by Docker Compose runtime for `web`/`worker`; this overrides container `STORAGE_ENDPOINT`)
- `REDIS_URL` and `DATABASE_URL` hostnames (production infra hostnames instead of `localhost`)
- `RESEND_FROM_EMAIL` (use a sender address on your verified domain)

Example command block:

```bash
AUTH_SECRET_VALUE="$(openssl rand -base64 32 | tr -d '\n')"
APP_ENCRYPTION_KEY_VALUE="$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n')"
REDIS_PASSWORD_VALUE="$(openssl rand -hex 32)"
DATABASE_URL_VALUE="postgresql://postgres:postgres@localhost:5432/merchtable?schema=public"
APP_BASE_URL_VALUE="https://store.example.com"
DOCKER_STORAGE_ENDPOINT_VALUE="https://store.example.com"
STORAGE_PUBLIC_BASE_URL_VALUE="https://store.example.com/media"
RESEND_FROM_EMAIL_VALUE="no-reply@example.com"

sed -i \
  -e "s|^DATABASE_URL=.*|DATABASE_URL=\"$DATABASE_URL_VALUE\"|" \
  -e "s|^APP_BASE_URL=.*|APP_BASE_URL=\"$APP_BASE_URL_VALUE\"|" \
  -e "s|^DOCKER_STORAGE_ENDPOINT=.*|DOCKER_STORAGE_ENDPOINT=\"$DOCKER_STORAGE_ENDPOINT_VALUE\"|" \
  -e "s|^STORAGE_PUBLIC_BASE_URL=.*|STORAGE_PUBLIC_BASE_URL=\"$STORAGE_PUBLIC_BASE_URL_VALUE\"|" \
  -e "s|^RESEND_FROM_EMAIL=.*|RESEND_FROM_EMAIL=\"$RESEND_FROM_EMAIL_VALUE\"|" \
  -e "s|^AUTH_SECRET=.*|AUTH_SECRET=\"$AUTH_SECRET_VALUE\"|" \
  -e "s|^APP_ENCRYPTION_KEY=.*|APP_ENCRYPTION_KEY=\"$APP_ENCRYPTION_KEY_VALUE\"|" \
  -e "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=\"$REDIS_PASSWORD_VALUE\"|" \
  .env
```

For same-domain Garage uploads behind Caddy, also set:

```bash
sed -i -e 's|^STORAGE_USE_PATH_STYLE=.*|STORAGE_USE_PATH_STYLE="true"|' .env
```

6. Start the full stack:

```bash
docker compose up -d --build
bash ./scripts/bootstrap-garage.sh
```

Optional npm wrapper (same action):

```bash
npm run infra:up:all
```

First-run timing note:
- A cold first build (image pulls + dependency install + app build) commonly takes 8-20 minutes.
- On slower hardware or networks, first startup can take 20-35 minutes.
- Subsequent rebuilds are usually much faster due to Docker layer caching.

Core services only (without `web`/`worker`, plus Garage bootstrap):

```bash
docker compose up -d postgres redis garage
bash ./scripts/bootstrap-garage.sh
```

Optional npm wrapper (same action):

```bash
npm run infra:up
```

7. Verify services:

```bash
docker compose ps
```

After services are up, continue with the setup wizard walkthrough in [`docs/setup-wizard.md`](./setup-wizard.md).

## Host Dev Workflow (Optional)

Use this when you want local hot reload with `npm run dev`.

1. Install dependencies:

```bash
npm install
```

2. Start infrastructure only:

```bash
docker compose up -d postgres redis garage
bash ./scripts/bootstrap-garage.sh
```

3. Run the app on host:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Database Setup Notes

### Docker Postgres (recommended)

Use this URL in `.env`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/merchtable?schema=public"
```

### Local Postgres (optional)

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

- Primary recommendation: Resend
- Good alternatives: Postmark, Amazon SES

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

For active development, run the app on the host for hot reload:

```bash
npm run dev
```

Open `http://localhost:3000`.

For full container validation, run:

```bash
docker compose up -d --build
bash ./scripts/bootstrap-garage.sh
```
