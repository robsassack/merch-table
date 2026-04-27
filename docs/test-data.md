# Deterministic Test Data

Run the test seed with:

```bash
npm run seed:test
```

The script loads `.env.test`, refuses to run unless `DATABASE_URL` points at
`merchtable_test`, resets the test database, and recreates a stable fixture set
for local, integration, load, and E2E tests.

## Storefront

- Organization: `org_test_main`
- Admin user: `admin@example.test`
- Artist: `test-artist`
- Featured release: `fixed-release`

## Releases

- Free release: `/release/free-release`, id `release_test_free`
- Fixed release: `/release/fixed-release`, id `release_test_fixed`, price `700`
  cents
- PWYW release: `/release/pwyw-release`, id `release_test_pwyw`, minimum `300`
  cents
- Lossy-only release: `/release/lossy-only-release`, id
  `release_test_lossy_only`

## Customers And Orders

- Paid customer: `paid@example.test`
- Failed customer: `failed@example.test`
- Revoked-access customer: `revoked@example.test`
- Expired-access customer: `expired@example.test`
- Free order: `FREE-TEST-0001`
- Fixed order: `STRIPE-TEST-0001`
- Failed order: `STRIPE-TEST-FAILED-0001`

## Library Tokens

- Valid: `test_library_valid_paid`
- Revoked: `test_library_revoked`
- Expired: `test_library_expired`

## Entitlement Tokens

- Free MP3: `test_entitlement_free_mp3`
- Fixed FLAC: `test_entitlement_fixed_flac`
- Fixed MP3: `test_entitlement_fixed_mp3`
- Failed-order fixed MP3: `test_entitlement_failed_fixed_mp3`
- Revoked-library fixed FLAC: `test_entitlement_revoked_fixed_flac`
- Expired fixed FLAC: `test_entitlement_expired_fixed_flac`

All fixture timestamps are fixed. Storage rows use deterministic `test/releases/*`
keys, but the seed does not upload binary objects to local storage.
