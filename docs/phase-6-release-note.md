# Phase 6 Release Note (Buyer Library & Downloads)

Date: 2026-04-04

## Scope shipped

- Buyer library token validation and access tracking (`lastUsedAt`, `accessCount`).
- Single-file download endpoint with fresh signed URL generation per request.
- Release ZIP downloads with:
  - required naming conventions
  - cover art inclusion when present
  - mixed-format behavior (`best` default, optional `mode=all`, optional explicit `format`)
- Library resend endpoint with generic success response (non-enumerating), CSRF protection, and rate limits.
- Library/release sync behavior so newly added, removed, or renamed tracks/files are reflected for buyers.

## Test coverage highlights

- Library access tracking increments on token use.
- Resend flow behavior, including `429` and `Retry-After`.
- Signed URL freshness on each request.
- ZIP content checks for expected track entries + cover art + filename conventions.
- Download continuity while transcode outputs are queued/running (fallback assets remain downloadable).

## Operational checks to run in production

1. Verify `TRUST_PROXY_HEADERS` is correct for your proxy/load balancer setup so IP-based rate limits bucket clients correctly.
2. Verify signed URL TTL behavior for `SIGNED_URL_EXPIRY_SECONDS` with synchronized host/container clocks.
3. Run one real transcode backlog sanity check (worker + Redis) and confirm fallback download behavior during queue/running states.
4. Confirm logs/monitoring capture resend and download failure signals clearly:
   - `[library.resend]`
   - `[library.download]`
   - `[library.download_release]`
