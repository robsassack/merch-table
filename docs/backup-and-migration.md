# Backup And Migration Runbook

Operational runbook for:

- Scheduled Postgres backups (`pg_dump`)
- Garage asset backups (`mc mirror`)
- Migration from bundled Garage to external S3

Assumptions:

- Docker Compose deployment (`postgres`, `garage`, `web`, `worker`)
- `.env` contains current runtime credentials
- You run commands from repository root

## 1) Postgres Backup (Scheduled `pg_dump`)

### One-off backup

```bash
mkdir -p backups/postgres
docker compose exec -T postgres \
  pg_dump -U postgres -d merchtable -F c -Z 9 \
  > "backups/postgres/merchtable-$(date +%F-%H%M%S).dump"
```

Verify backup file:

```bash
ls -lh backups/postgres
```

### Restore example

```bash
createdb -h localhost -U postgres merchtable_restore_test
pg_restore -h localhost -U postgres -d merchtable_restore_test --clean --if-exists backups/postgres/<backup-file>.dump
```

### Scheduled backup (cron example)

Run nightly at 02:15 and keep 14 days of dumps:

```cron
15 2 * * * cd /path/to/merch-table && mkdir -p backups/postgres && docker compose exec -T postgres pg_dump -U postgres -d merchtable -F c -Z 9 > backups/postgres/merchtable-$(date +\%F-\%H\%M\%S).dump && find backups/postgres -type f -name '*.dump' -mtime +14 -delete
```

Notes:

- Test restores regularly; untested backups are risky.
- Consider copying dumps to off-host storage (S3/object store) after creation.

## 2) Garage Asset Backup (`mc mirror`)

Use MinIO Client (`mc`) to mirror Garage bucket contents into a backup location.

### Configure aliases

```bash
mc alias set garage http://localhost:3900 "$STORAGE_ACCESS_KEY_ID" "$STORAGE_SECRET_ACCESS_KEY" --api S3v4
mc alias set backup https://<backup-s3-endpoint> "<backup-access-key>" "<backup-secret-key>" --api S3v4
```

### Mirror assets (incremental)

```bash
mc mirror --overwrite --remove garage/media backup/merchtable-media-backup
```

Recommended dry run first:

```bash
mc mirror --dry-run --overwrite --remove garage/media backup/merchtable-media-backup
```

### Verify backup objects

```bash
mc ls --recursive garage/media | wc -l
mc ls --recursive backup/merchtable-media-backup | wc -l
```

Notes:

- `--remove` makes destination match source exactly (deletions included). Omit it if you want append-only backup behavior.
- Run a periodic restore drill by copying a small prefix/object back into a test bucket and validating download.

## 3) Migration: Bundled Garage -> External S3

This is a cutover runbook that preserves object keys so existing DB `storageKey` values remain valid.

### Pre-checks

1. Confirm external bucket exists and credentials have read/write/list permissions.
2. Record current env values (`STORAGE_*`, `DOCKER_STORAGE_ENDPOINT`).
3. Plan a maintenance window (recommended).

### A) Freeze writes

1. Stop user/admin write activity (maintenance window).
2. Stop transcode worker to avoid new asset writes:

```bash
docker compose stop worker
```

### B) Copy assets from Garage to external S3

Use `mc` with source Garage and destination S3 aliases:

```bash
mc alias set garage http://localhost:3900 "$STORAGE_ACCESS_KEY_ID" "$STORAGE_SECRET_ACCESS_KEY" --api S3v4
mc alias set target https://<external-s3-endpoint> "<external-access-key>" "<external-secret-key>" --api S3v4
mc mirror --overwrite garage/media target/<external-bucket-name>
```

Validate object counts:

```bash
mc ls --recursive garage/media | wc -l
mc ls --recursive target/<external-bucket-name> | wc -l
```

### C) Switch app config to external S3

In `.env`, set:

- `STORAGE_MODE="S3"`
- `STORAGE_BUCKET="<external-bucket-name>"`
- `STORAGE_REGION="<external-region>"`
- `STORAGE_ACCESS_KEY_ID="<external-access-key>"`
- `STORAGE_SECRET_ACCESS_KEY="<external-secret-key>"`
- `STORAGE_USE_PATH_STYLE="false"` (or `true` if your provider requires it)
- `STORAGE_ENDPOINT="<external-endpoint>"` (required for most S3-compatible providers; optional for AWS S3)

If running with Docker Compose service-name overrides, also set:

- `DOCKER_STORAGE_ENDPOINT="<external-endpoint>"` (or leave unset for AWS S3)

Restart app services:

```bash
docker compose up -d web worker
```

### D) Verify cutover

1. Open admin and confirm existing cover art/track assets load.
2. Run upload URL flow and upload a small test file.
3. Confirm buyer download endpoints return valid signed URLs for existing releases.
4. Check `GET /api/health/ready`.

### E) Rollback (if needed)

If verification fails, revert `.env` to previous Garage values and restart:

```bash
docker compose up -d web worker
```

Because object keys are unchanged, rollback is config-only if Garage data remains intact.
