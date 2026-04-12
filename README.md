# Merch Table

Merch Table is a Next.js + Prisma app for running a digital music storefront for independent artists and labels.

## Features

- Interactive release catalog management with flexible payment option support
- Intuitive storefront for browsing releases and artists
- Publishes digital releases with flexible format delivery (`MP3`, `M4A`, `FLAC`)
- Handles Stripe checkout and webhook-driven order fulfillment
- Provides buyer library access and signed download links
- Includes an operational setup wizard for first-run configuration
- Runs a background transcode worker for preview and delivery assets

## Stack

- App: Next.js (App Router), React 19, TypeScript, Tailwind CSS 4
- Data: Prisma, PostgreSQL, Redis
- Auth and Validation: Better Auth, Zod
- Storage and Media: AWS SDK v3 (S3-compatible APIs), bundled Garage or external S3 provider, FFmpeg/FFprobe worker pipeline
- Email and Payments: Nodemailer (SMTP), Stripe
- Infra: Docker Compose (web, worker, postgres, redis, garage)

## Project Status

- Active build in phased delivery.
- Current planning artifacts:
  - [V1 Build Plan](docs/merch-table-v1-plan.md)
  - [V1 Build Checklist](docs/merch-table-v1-build-checklist.md)

## Documentation

- [Setup Guide](docs/setup.md): prerequisites, environment, local stack startup, migrations, tests, troubleshooting
- [Worker and Storage](docs/worker-and-storage.md): transcode worker behavior, Garage notes, networking
- [Setup Wizard](docs/setup-wizard.md): bootstrap flow, wizard steps, security behavior, env flags
- [Stripe Local Webhook Testing](docs/stripe-webhooks-local.md): Stripe CLI forwarding and test events
