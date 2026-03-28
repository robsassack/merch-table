# Merch Table

Merch Table is a Next.js + Prisma app for running a digital music storefront.

## Prerequisites

- Node.js 22+
- npm 10+
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

### Option A: Docker Postgres (recommended)

```bash
docker run --name merchtable-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=merchtable \
  -p 5432:5432 \
  -d postgres:16
```

Use this URL in `.env`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/merchtable?schema=public"
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

## Verify DB Connectivity

```bash
npx prisma migrate status
```

If this command succeeds and shows your migration state, your database connection is working.

## Run the App

```bash
npm run dev
```

Open `http://localhost:3000`.
