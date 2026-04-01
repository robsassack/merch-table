# Merch Table v1 — Build Checklist

Ordered so each phase produces something testable before the next begins. Check items off as you go.

---

## Phase 0: Foundations & Secrets

> Goal: Clean slate, working local dev, schema ready.

- [x] Rotate all existing local secrets; create `.env.example` with documented values
- [x] Define all env vars (required + optional) and their defaults in `.env.example`
- [x] Verify Docker Compose brings up `postgres`, `redis`, `garage` with named volumes
- [x] Add `web` and `worker` service stubs to Docker Compose

### Schema migration

- [x] Add `StoreSettings` table (`storeStatus`, `setupComplete`, branding fields, `currency`, preview defaults, contact/social links)
- [x] Add `ReleaseTrack` table (`releaseId`, `title`, `trackNumber`, `durationMs`, lyrics/credits)
- [x] Add `TrackAsset` table (`trackId`, `storageKey`, `format`, `mimeType`, `fileSizeBytes`, bitrate/sampleRate/channels, `isLossless`, `assetRole` enum)
- [x] Add pricing fields to `Release` (`pricingMode` enum, `fixedPriceCents`, `minimumPriceCents`)
- [x] Add preview fields to `ReleaseTrack` (`previewMode` enum, `previewSeconds`)
- [x] Extend `Order` with Stripe linkage (`checkoutSessionId` unique, `paymentIntentId`, `taxCentsFromStripe`) and email tracking (`emailStatus` enum, `emailSentAt`)
- [x] Add `BuyerLibraryToken` table (`expiresAt`, `revokedAt`, `lastUsedAt`, `accessCount`)
- [x] Add `deletedAt` nullable timestamp to `Artist` and `Release`
- [x] Add `TranscodeJob` and `TranscodeOutput` tables
- [x] Create all enums: `PricingMode`, `PreviewMode`, `AssetRole`, `TranscodeStatus`, `StoreStatus`, `EmailStatus`
- [x] Verify `prisma migrate deploy` runs cleanly in container entrypoint; container exits non-zero on failure

---

## Phase 1: First-Run Experience & Admin Auth

> Goal: Fresh container → setup wizard → working admin dashboard shell.

### Bootstrap token

- [x] On first start, if no admin exists, print one-time setup token to stdout with 30-min expiry
- [x] `/setup?token=...` grants wizard access; token is single-use and invalidated on use or expiry

### Setup wizard (`/setup`)

- [x] Middleware: check `StoreSettings.setupComplete`; if false, redirect all routes to `/setup`
- [x] Step 1 — Store basics: org name, store name, contact email, currency (ISO code, default USD)
- [x] Step 2 — SMTP config: host, port, credentials + "send test email" action; block progression on failure
- [x] Step 3 — Storage: choose bundled Garage (default) or external S3; validate credentials if external
- [x] Step 4 — Stripe: API key + webhook secret; display exact webhook URL; "verify connection" check
- [x] Step 5 — Admin account: enter admin email; send first magic-link using SMTP from Step 2
- [x] Step 6 — Confirmation: set `setupComplete = true`, `storeStatus = PRIVATE`, redirect to admin

### Setup wizard test email template

- [x] Minimal HTML template confirming SMTP works

### Admin auth

- [x] Magic-link email login flow (request link → email → validate token → session)
- [x] Admin magic-link login email template (one-time link + expiry notice)
- [x] Bootstrap token fallback path (for when SMTP is misconfigured on first deploy)

### Store status middleware

- [x] `SETUP` → redirect to `/setup`
- [x] `PRIVATE` → admin accessible; public visitors see maintenance/coming-soon page
- [x] `PUBLIC` → store fully live

---

## Phase 2: Storage & File Upload

> Goal: Admin can upload audio files to Garage/S3 via presigned URLs.

- [x] Storage adapter abstraction supporting Garage and external S3 via env config
- [x] `POST /api/admin/upload/upload-url` — generate presigned PUT URL for direct-to-storage upload
- [x] Client-side upload UI: filename, file size, progress bar; save disabled during upload
- [x] Ability to upload multiple files at once
- [x] Ability to drag and drop uploads
- [x] Client-side validation of file type and minimum bitrate/sample rate before upload
- [x] Retry button on upload failure without losing other form state
- [x] Server-side file size limit configurable via env var (default 2 GB)
- [x] Rate limiting on upload URL endpoint (moderate per admin session)

---

## Phase 3: Admin CRUD — Artists, Releases, Tracks

> Goal: Admin can create and manage the full catalog.

### Artist management

- [x] Artist CRUD (create, read, update)
- [x] Soft delete with `deletedAt`; "deleted" badge in admin; restore action
- [x] Permanent purge action with confirmation

### Release management

- [x] Release CRUD with pricing setup (`FREE`, `FIXED`, `PWYW`)
- [x] System minimum price floor enforcement (env var, default $0.50)
- [x] Pricing UI: inline Stripe fee estimate and net payout, updates dynamically
- [x] Pricing UI: warning when price is below system minimum floor
- [x] Upload workflow: prompt for lossless masters first; if missing, mark lossy-only with confirmation
- [x] Quality disclosure flag when only lossy files are available
- [x] Soft delete with `deletedAt`; "deleted" badge in admin; restore action
- [x] Permanent purge action (removes storage assets, requires confirmation)

### Track management

- [x] Track CRUD within a release (title, track number, duration, lyrics/credits)
- [x] Associate `TrackAsset` records on upload (master, delivery roles)
- [x] Preview mode controls per track (`CLIP` / `FULL`, `previewSeconds`)
- [x] Automatic preview clip generation queued on asset upload when `previewMode` is `CLIP`

---

## Phase 4: Worker & Transcoding

> Goal: Worker process runs FFmpeg jobs; preview clips are generated automatically.

- [x] Worker service in Docker Compose consuming job queue (Redis-backed)
- [x] Preview clip generation job: extracts clip from master, stores as `TrackAsset` with `assetRole: PREVIEW`
- [x] Optional "generate download formats" action when lossless masters exist (queues transcode)
- [x] `TranscodeJob` status tracking (`QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED`)
- [x] `TranscodeOutput` records created on success

### Edge cases (Priority 1)

- [x] Add stale-job recovery: detect `QUEUED` jobs older than threshold and auto-requeue or mark failed with actionable reason
- [x] Ensure delivery job dedupe is race-safe (no duplicate queued jobs for same source + kind under concurrent requests)
- [x] Add worker health visibility in admin/status view (queue depth, worker up/down, last successful job time)

### Edge cases (Priority 2)

- [x] Add `jobKind` on `TranscodeJob` (`PREVIEW_CLIP`, `DELIVERY_FORMATS`) to avoid ambiguous retries and status badges
- [x] Add retry policy for transient failures (storage/network/temporary ffmpeg errors), with capped attempts and backoff
- [x] Handle format changes during active delivery transcode (`release.deliveryFormats` changed while job is `RUNNING`)
- [ ] Ensure partial output cleanup behavior is consistent when one delivery format fails after others succeed
- [ ] Add explicit requeue action for failed jobs from admin UI (single track + bulk release)
- [ ] Add automated test coverage for preview requeue flow when `previewSeconds` is changed repeatedly
- [ ] Add automated test coverage for duplicate queue messages and worker concurrency >1

---

## Phase 5: Payments & Checkout

> Goal: End-to-end purchase flow for paid and free releases.

### Stripe integration

- [ ] `POST /api/checkout/session` — create Stripe Checkout session for `FIXED` and `PWYW` releases
- [ ] Server-side PWYW validation: reject amounts below `minimumPriceCents`
- [ ] System minimum price floor enforced on session creation
- [ ] Stripe Tax basic enabled during Checkout session creation
- [ ] Currency from `StoreSettings` passed to all Checkout sessions

### Free checkout

- [ ] `POST /api/checkout/free` — email capture, create Order, issue `BuyerLibraryToken`, send library magic-link
- [ ] Reject requests with no email address
- [ ] Rate limiting (strict, to prevent email-bombing)

### Webhook

- [ ] `POST /api/webhooks/stripe` — verify signature, finalize order, create entitlements
- [ ] Idempotency: check existing `Order` by `checkoutSessionId` inside a transaction; skip if exists
- [ ] Unique constraint on `Order.checkoutSessionId` as database-level safety net
- [ ] Webhook endpoint is not rate-limited

### Email templates

- [ ] Purchase confirmation email (library magic-link, release name, amount paid)
- [ ] Free-release library link email (library magic-link, release name)
- [ ] `emailStatus` tracking on Order (`PENDING`, `SENT`, `FAILED`)

---

## Phase 6: Buyer Library & Downloads

> Goal: Buyers can access their library and download files.

- [ ] `GET /api/library/:token` — resolve buyer library; validate token not revoked/expired
- [ ] `BuyerLibraryToken` access tracking: update `lastUsedAt` and `accessCount` on each access
- [ ] `GET /api/download/:entitlementToken/:assetId` — validate token, generate fresh signed URL per request
- [ ] Signed URL expires after 15 minutes (configurable via env var); never cached or reused
- [ ] `Content-Disposition: attachment` with human-readable filename (`Artist - Track Title.flac`)
- [ ] Revoked token returns 403; expired token returns 403
- [ ] Rate limiting on download endpoint (moderate, prevents bulk scraping)
- [ ] Rate limiting on checkout session creation (moderate)

---

## Phase 7: Storefront — Public Pages

> Goal: Buyers can browse, preview, and purchase from the storefront.

### Home / catalog page

- [ ] List published releases (exclude soft-deleted)
- [ ] Respect `storeStatus` middleware (private = maintenance page)

### Release detail page

- [ ] Tracklist display with track metadata
- [ ] Pricing UI for `FREE` / `FIXED` / `PWYW` modes
- [ ] Quality disclosure notice when only lossy files available
- [ ] "You own this — go to your library" indicator with "Buy again" secondary option
- [ ] Client-side owned-release detection via cookie/localStorage (UX hint only)

### Audio player (Howler.js)

- [ ] Single persistent player instance on release page
- [ ] Per-track preview playback (clip or full based on `previewMode`)
- [ ] Click new track → stop current → start new; UI updates to reflect active track
- [ ] Play/pause, progress bar, track title display
- [ ] Respects browser autoplay restrictions (user gesture required)

### Post-purchase confirmation page

- [ ] Shown after Stripe redirect or free checkout
- [ ] Links to buyer library

---

## Phase 8: Accessibility Pass

> Goal: WCAG 2.1 AA compliance across storefront and admin.

- [ ] Semantic HTML: proper heading hierarchy, landmark regions (`nav`, `main`, `footer`)
- [ ] Skip-to-content link on all pages
- [ ] All form inputs have associated `<label>` elements
- [ ] Validation errors surfaced with `aria-describedby`
- [ ] Full keyboard navigation: all interactive elements reachable and operable
- [ ] Visible focus indicators on all focusable elements
- [ ] Audio player: keyboard-accessible play/pause and track selection with ARIA labels
- [ ] Player state changes announced via `aria-live` region
- [ ] Color contrast meets AA (4.5:1 normal text, 3:1 large text) on all pages
- [ ] Run automated accessibility audit (axe-core or equivalent); fix all critical/serious violations

---

## Phase 9: Admin Dashboard Extras

> Goal: Orders panel, token management, status panel, store toggling.

### Orders & customers panel

- [ ] List orders with email delivery status
- [ ] Retry action for undelivered (`FAILED`) purchase confirmation emails
- [ ] Revoke individual `BuyerLibraryToken`s

### Store management

- [ ] Toggle `PRIVATE` ↔ `PUBLIC` from dashboard
- [ ] Settings UI: allow updating org name
- [ ] Settings UI: allow updating store name
- [ ] Settings UI: allow updating contact email
- [ ] Settings UI: allow updating store currency
- [ ] Settings UI: allow updating SMTP/email configuration
- [ ] Settings UI: allow updating Stripe API key + webhook secret
- [ ] Settings UI: allow updating admin email
- [ ] Storage safety guardrail: disallow switching `GARAGE` ↔ `S3` after assets exist
- [ ] Storage migration path (optional later): explicit, guided migration job with confirmation + validation
- [ ] "Factory reset" option in settings (re-triggers wizard; does not wipe data without explicit confirmation)
- [ ] Add markdown editing tools to release description field
- [ ] Add default options for pricing, download formats, and preview settings when creating a new release

### Status panel

- [ ] Service connectivity: database, Redis, storage reachable/unreachable
- [ ] Worker health: connected status, transcode queue depth, last completed job timestamp
- [ ] Email delivery: count of recent `FAILED` emails with link to orders panel
- [ ] Storage usage: total asset size from database (not live bucket query)

---

## Phase 10: Rate Limiting & Health Endpoints

> Goal: Production-hardened endpoints with observability.

### Rate limiting (Redis-backed, IP-based)

- [ ] `POST /api/checkout/free` — strict limit
- [ ] `GET /api/download/:entitlementToken/:assetId` — moderate limit
- [ ] `POST /api/admin/upload/upload-url` — moderate limit
- [ ] `POST /api/checkout/session` — moderate limit
- [ ] Thresholds configurable via env vars
- [ ] 429 response with `Retry-After` header on exceeded limits
- [ ] Stripe webhook explicitly excluded from rate limiting

### Health endpoints

- [ ] `GET /api/health/live` — app is running
- [ ] `GET /api/health/ready` — app + all dependencies reachable; component-level status JSON
- [ ] Suitable for Docker healthchecks

### Logging

- [ ] Structured logs with event type tags (`webhook.received`, `email.failed`, `transcode.completed`, `download.served`)
- [ ] Configurable log level via env var

---

## Phase 11: Docker & Deployment

> Goal: Single `docker compose up` gets a working stack.

- [ ] Docker Compose profile: `web`, `postgres`, `garage`, `redis`, `worker` with named volumes
- [ ] Container entrypoint runs `prisma migrate deploy`; exits non-zero on failure
- [ ] Storage adapter works with both bundled Garage and external S3 via env config
- [ ] Worker processes transcode jobs via FFmpeg
- [ ] Dockerfile builds and runs cleanly
- [ ] `docker compose up` from scratch → bootstrap token in logs → setup wizard → working store

---

## Phase 12: Documentation

> Goal: A self-hoster can deploy and operate without asking you questions.

- [ ] `README` with project overview, prerequisites, quickstart
- [ ] `.env.example` with every variable, defaults, and commentary
- [ ] Setup wizard walkthrough
- [ ] SMTP provider recommendations (Resend primary, Postmark/SES alternatives, Gmail discouraged)
- [ ] SPF/DKIM note for email deliverability
- [ ] Postgres backup instructions (scheduled `pg_dump` example)
- [ ] Garage asset backup (`mc mirror` example)
- [ ] Migration from bundled Garage to external S3
- [ ] Upgrading section: `docker compose pull && up -d`, snapshot before upgrade, rollback instructions
- [ ] What must survive a container wipe (Postgres volume, Garage volume / S3 bucket, `.env`)
- [ ] Auth secret rotation note (invalidates sessions/magic links)

---

## Phase 13: Testing

> Goal: Confidence that the system works as specified.

### Unit tests

- [ ] Pricing validation for free/fixed/PWYW paths
- [ ] PWYW rejects amount below `minimumPriceCents`
- [ ] System minimum floor rejects below threshold
- [ ] Admin pricing UI estimated Stripe fee / net payout
- [ ] Preview policy resolution (clip/full, release defaults vs track overrides)
- [ ] Quality disclosure logic (lossy-only)
- [ ] Bootstrap token single-use + 30-min expiry
- [ ] Revoked `BuyerLibraryToken` → 403
- [ ] Expired `BuyerLibraryToken` → 403
- [ ] File size limit enforcement
- [ ] Free checkout rejects missing email

### Integration tests

- [ ] Checkout session creation with Stripe Tax
- [ ] Webhook idempotency (duplicate event → one Order, one email)
- [ ] Entitlement generation and library token issuance
- [ ] Free checkout issues entitlement + sends email without Stripe
- [ ] `lastUsedAt` / `accessCount` update on library access
- [ ] Presigned upload URL generation and expiry
- [ ] Preview clip auto-created on track upload when previewMode is CLIP
- [ ] Download endpoint generates fresh signed URL each time
- [ ] Email failure sets `emailStatus` to `FAILED` on Order
- [ ] All four email templates render valid HTML with correct dynamic values
- [ ] Rate limiter returns 429 with `Retry-After` on free checkout
- [ ] Rate limiter returns 429 on download; resets after window
- [ ] Stripe webhook endpoint not rate-limited under rapid consecutive delivery

### End-to-end scenarios

- [ ] Fresh container → bootstrap token → setup wizard → store `PRIVATE`
- [ ] Setup SMTP step fails → blocks progression with clear error
- [ ] `PRIVATE` store → maintenance page for public visitors
- [ ] Admin sets `PUBLIC` → storefront accessible
- [ ] Admin creates release with lossless masters (including >100 MB file)
- [ ] Admin uploads multiple files in one action (batch upload) successfully
- [ ] Admin drag-and-drop upload works (including progress and completion state)
- [ ] Admin creates lossy-only release → quality warning on storefront
- [ ] Buyer claims free release with email → receives library link (no Stripe)
- [ ] Buyer purchases fixed-price → receives magic link → downloads multiple times
- [ ] Buyer revisits owned release → "You own this" shown; re-purchase works
- [ ] Buyer PWYW above minimum → correct entitlements
- [ ] Preview playback works for clip and full modes (clip is separate stored file)
- [ ] Switching tracks stops current, starts new; player UI updates
- [ ] Admin revokes token → buyer gets 403
- [ ] Admin retries failed email from orders panel
- [ ] Downloaded file has human-readable filename
- [ ] Admin soft-deletes release → gone from storefront, buyer retains access; restore brings it back
- [ ] Admin purges soft-deleted assets → storage files removed, download returns 404
- [ ] Storefront passes axe-core with no critical/serious WCAG 2.1 AA violations
- [ ] Audio player fully operable via keyboard

### Deployment verification

- [ ] Compose up succeeds with bundled Garage
- [ ] External S3 config validated
- [ ] Worker processes a transcode job
- [ ] Container upgrade applies migrations and starts
- [ ] Container exits non-zero if migration fails
- [ ] Health endpoints return component-level status; `ready` reports unhealthy when DB is down
- [ ] Admin status panel reflects failed emails and queue depth accurately
