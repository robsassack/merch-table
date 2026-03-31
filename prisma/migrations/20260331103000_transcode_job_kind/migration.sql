-- CreateEnum
CREATE TYPE "TranscodeJobKind" AS ENUM ('PREVIEW_CLIP', 'DELIVERY_FORMATS');

-- AlterTable
ALTER TABLE "TranscodeJob" ADD COLUMN "kind" "TranscodeJobKind";

-- Backfill from existing outputs when available.
UPDATE "TranscodeJob" AS job
SET "kind" = 'PREVIEW_CLIP'::"TranscodeJobKind"
WHERE "kind" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "TranscodeOutput" AS output
    INNER JOIN "TrackAsset" AS asset ON asset.id = output."outputAssetId"
    WHERE output."jobId" = job.id
      AND asset."assetRole" = 'PREVIEW'
  );

UPDATE "TranscodeJob" AS job
SET "kind" = 'DELIVERY_FORMATS'::"TranscodeJobKind"
WHERE "kind" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "TranscodeOutput" AS output
    INNER JOIN "TrackAsset" AS asset ON asset.id = output."outputAssetId"
    WHERE output."jobId" = job.id
      AND asset."assetRole" = 'DELIVERY'
  );

-- Fall back for unresolved historical jobs.
UPDATE "TranscodeJob" AS job
SET "kind" = CASE
  WHEN source."isLossless" = false THEN 'PREVIEW_CLIP'::"TranscodeJobKind"
  ELSE 'DELIVERY_FORMATS'::"TranscodeJobKind"
END
FROM "TrackAsset" AS source
WHERE source.id = job."sourceAssetId"
  AND job."kind" IS NULL;

ALTER TABLE "TranscodeJob"
ALTER COLUMN "kind" SET NOT NULL,
ALTER COLUMN "kind" SET DEFAULT 'DELIVERY_FORMATS'::"TranscodeJobKind";

-- Add lookup index used by active-job dedupe checks.
CREATE INDEX "TranscodeJob_organizationId_sourceAssetId_kind_status_idx"
ON "TranscodeJob" ("organizationId", "sourceAssetId", "kind", "status");
