# Merch Table v1 Plan

## Summary

- Current stack snapshot: Next.js App Router + TypeScript + Tailwind 4 + Prisma/Postgres are set up; database schema already covers organizations, artists, releases, orders, and download entitlements; app/business logic is still scaffold-level.
- Product direction locked: digital-only storefront, single-org per deployment, guest checkout with magic-link library, Stripe Checkout + Stripe Tax basic, S3-compatible storage with Docker Compose defaulting to bundled MinIO, release+track model, and host-configurable preview mode (timed clip or full preview).
- Security first step: rotate existing local secrets and replace with documented `.env.example` values before publishing/open-sourcing.

## Key Implementation Changes

- App architecture:
  - Keep a single Next.js app with App Router.
  - Use server actions for admin mutations and route handlers for webhooks/download endpoints.
  - Enforce single-org runtime (use one canonical org slug from config); keep existing multi-org schema compatibility for future expansion.
- Data model evolution (Prisma):
  - Add `StoreSettings` (branding, homepage copy, preview defaults, transcoding enabled, contact/social links).
  - Add `ReleaseTrack` (releaseId, title, trackNumber, durationMs, lyrics/credits optional).
  - Add `TrackAsset` (trackId, storageKey, format, mimeType, bitrate/sampleRate/channels, isLossless, assetRole).
  - Add pricing fields on `Release`: `pricingMode` (`FREE|FIXED|PWYW`), `fixedPriceCents`, `minimumPriceCents`.
  - Add preview fields on `ReleaseTrack`: `previewMode` (`CLIP|FULL`), `previewSeconds` (nullable when full).
  - Add `TranscodeJob` and `TranscodeOutput` for optional server-side variants when lossless masters exist.
  - Extend `Order` with Stripe linkage (`checkoutSessionId`, `paymentIntentId`, `taxCentsFromStripe`).
  - Add `BuyerLibraryToken` for reusable emailed access links.
- Storefront experience:
  - Public pages: home/catalog, release detail, cart/checkout redirect, post-purchase confirmation, buyer library (token-auth).
  - Release page supports tracklist, per-track preview playback (clip/full), and pricing UI for free/fixed/PWYW.
  - Before purchase, show quality disclosure if only lossy files are available.
- Admin experience:
  - Email magic-link admin auth.
  - Admin sections: branding/settings, artist/release CRUD, track management, asset uploads, preview mode controls, pricing setup, orders/customers.
  - Upload workflow prompts for lossless masters first; if missing, mark release as lossy-only and require confirmation.
  - Optional “generate download formats” action when lossless masters exist (queues transcoding).
- Payments/download fulfillment:
  - Stripe Checkout session creation per order draft.
  - Stripe webhook (`checkout.session.completed`) finalizes order and creates entitlements.
  - Stripe Tax basic enabled during Checkout session creation.
  - Entitlements are unlimited; buyer receives email magic-link to library with re-download access.
- Self-host/deployment:
  - Provide Docker Compose profile with `web`, `postgres`, `minio`, `redis`, `worker`.
  - Worker handles transcoding jobs via FFmpeg.
  - Storage adapter supports MinIO and external S3-compatible providers through env config.
  - Add health/readiness endpoints and basic structured logs.

## Public APIs / Interfaces / Types

- HTTP endpoints:
  - `POST /api/checkout/session` (create Stripe Checkout session).
  - `POST /api/webhooks/stripe` (verify signature, finalize order/entitlements).
  - `GET /api/library/:token` (resolve buyer library).
  - `GET /api/download/:entitlementToken/:assetId` (authorize and redirect signed object URL).
- Core enums/types:
  - `PricingMode`: `FREE | FIXED | PWYW`.
  - `PreviewMode`: `CLIP | FULL`.
  - `AssetRole`: `MASTER | PREVIEW | DELIVERY`.
  - `TranscodeStatus`: `QUEUED | RUNNING | SUCCEEDED | FAILED`.
- Environment contract:
  - Required: DB URL, auth secret, SMTP settings, Stripe keys/webhook secret, storage credentials, MinIO toggle.
  - Optional: Redis URL override, CDN base URL, transcoding concurrency.

## Test Plan

- Unit tests:
  - Pricing validation for free/fixed/PWYW paths.
  - Preview policy resolution (clip/full, release defaults vs track overrides).
  - Quality disclosure logic when only lossy files exist.
- Integration tests:
  - Checkout session creation with Stripe Tax settings.
  - Webhook idempotency and order state transitions.
  - Entitlement generation and library token issuance.
- End-to-end scenarios:
  - Admin creates release with tracks and uploads lossless masters.
  - Admin creates release with lossy-only files and storefront warning appears pre-purchase.
  - Buyer purchases fixed-price release, receives magic link, and downloads multiple times.
  - Buyer uses PWYW amount above minimum and receives correct entitlements.
  - Preview playback works for both clip and full modes.
- Deployment verification:
  - Compose up succeeds with bundled MinIO.
  - External S3 configuration path validated.
  - Worker processes a transcoding job and outputs variants.

## Assumptions and Defaults

- Single-org per deployment is enforced at runtime even though schema remains multi-org capable.
- License choice is intentionally deferred.
- Stripe Tax “basic use” means tax is computed in Stripe Checkout; no custom in-app tax engine.
- Transcoding is optional and only available when lossless masters are uploaded.
- If no lossless upload exists, purchasers only receive uploaded lossy assets and are warned before checkout.
