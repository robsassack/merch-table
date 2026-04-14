# Backup And Migration Runbook

Operational runbook for:

- Scheduled Postgres backups (`pg_dump`)
- Garage asset backups (`mc mirror`)
- Migration from bundled Garage to external S3
- Application upgrades with pre-upgrade snapshots and rollback

Assumptions:

- Docker Compose deployment (`postgres`, `garage`, `web`, `worker`)
- `.env` contains current runtime credentials
- You run commands from repository root

For targeted Garage outage/storage incident steps, see [`docs/worker-and-storage.md`](./worker-and-storage.md) and its "Recovery Playbook (Garage)" section.

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

## 4) Upgrading (Images Or Source) With Rollback

Use this section for routine upgrades of this repository's default Docker Compose setup.
By default, `web` and `worker` are built from local Dockerfiles, so routine upgrades are
source-code updates (`git pull`) followed by rebuild/restart.

### Pre-upgrade snapshot checklist

1. Create a Postgres backup:

```bash
mkdir -p backups/postgres
docker compose exec -T postgres \
  pg_dump -U postgres -d merchtable -F c -Z 9 \
  > "backups/postgres/pre-upgrade-$(date +%F-%H%M%S).dump"
```

2. Snapshot assets (incremental mirror):

```bash
mc mirror --overwrite garage/media backup/merchtable-media-backup
```

3. Record currently running revision (if using git checkout deploys):

```bash
git rev-parse HEAD
```

### Upgrade by pulling latest code (`git pull`) and rebuilding

```bash
git fetch --all --prune
git pull --ff-only
docker compose up -d --build
```

Validate:

```bash
docker compose ps
curl -sS -I http://localhost:3000/api/health/live
curl -sS -I http://localhost:3000/api/health/ready
```

### Rollback

1. Return to previous commit:

```bash
git checkout <previous-commit-sha>
```

2. Rebuild and restart:

```bash
docker compose up -d --build
```

If a DB migration caused the regression:

1. Stop app services (`web` and `worker`).
2. Restore the pre-upgrade Postgres dump to the target database.
3. Restart services and re-check health endpoints.

Optional registry-based upgrade path (only if you publish and pin `web`/`worker` images):

```bash
docker compose pull
docker compose up -d
```

## 5) What Must Survive A Container Wipe

If containers are recreated or removed, the following state must survive to avoid data loss:

- Postgres data: Docker volume `postgres_data` (or external managed Postgres data)
- Asset data:
  - bundled Garage mode: Docker volume `garage_data`
  - external storage mode: external S3 bucket objects
- App secrets/config: `.env` (or equivalent secret manager values)

### Safe vs unsafe compose commands

Safe for data volumes:

```bash
docker compose down
```

Destructive for named volumes:

```bash
docker compose down -v
```

`down -v` deletes `postgres_data`, `redis_data`, and `garage_data`. If used, restore from backups before returning to production traffic.

### Recovery checklist after a wipe

1. Restore `.env` with correct production values.
2. Restore Postgres data:
   - either attach original `postgres_data` volume
   - or restore from the latest `pg_dump` backup
3. Restore asset data:
   - Garage mode: restore `garage_data` or mirror objects back into Garage bucket
   - S3 mode: verify external bucket objects are intact and credentials are valid
4. Start services:

```bash
docker compose up -d
```

5. Verify system state:
   - `GET /api/health/live`
   - `GET /api/health/ready`
   - admin login
   - sample upload + download flow

## 6) Auth Secret Rotation

`AUTH_SECRET` signs auth/session-related tokens. Rotation is a manual operational change.

Impact of rotation:

- Existing authenticated sessions become invalid.
- Outstanding magic-link tokens signed with the previous secret stop working.
- Users/admins may need to sign in again.

### When to rotate

- Suspected secret exposure
- Scheduled security rotation policy
- Team/security event requiring credential turnover

### Rotation procedure

1. Schedule a maintenance window and notify admins that sign-in sessions will be reset.
2. Generate a new secret value (example):

```bash
openssl rand -base64 32
```

3. Update `AUTH_SECRET` in `.env` (or your secret manager/deploy environment).
4. Restart services so all instances use the new secret:

```bash
docker compose up -d web worker
```

5. Validate:
   - `GET /api/health/ready`
   - new admin magic-link login at `/admin/auth`
   - existing session cookies are expected to be invalidated

### Rollback

If rotation causes an incident, restore the previous `AUTH_SECRET` and restart services:

```bash
docker compose up -d web worker
```

Rollback note:

- Any tokens issued after rotation with the new secret will become invalid once you roll back to the old secret.

## 7) Postgres Password Rotation

Rotate Postgres credentials in a single coordinated change to avoid app outages.

Impact of rotation:

- If `DATABASE_URL` and the actual DB user password diverge, web/worker will fail with Prisma `P1000` authentication errors.

### Rotation procedure

1. Pick a new strong password.
2. Update Postgres user password in the running database:

```bash
docker compose exec -T postgres psql -U postgres -d postgres -c "ALTER USER postgres WITH PASSWORD '<new-password>';"
```

3. Update `.env` `DATABASE_URL` with the same password.
4. Recreate app containers so runtime env is refreshed:

```bash
docker compose up -d --force-recreate web worker
```

5. Validate:
   - `curl -s http://127.0.0.1:3000/api/health/ready`
   - `docker compose logs --tail=120 web` (no `P1000` auth errors)

### Rollback

If auth fails after rotation:

1. Set DB password back to previous value with `ALTER USER`.
2. Restore prior `DATABASE_URL` in `.env`.
3. Recreate `web` and `worker` containers.
