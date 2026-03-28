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
