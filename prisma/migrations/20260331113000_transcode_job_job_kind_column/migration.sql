-- Rename TranscodeJob.kind to TranscodeJob.jobKind for explicitness.
ALTER TABLE "TranscodeJob"
RENAME COLUMN "kind" TO "jobKind";

-- Keep index naming aligned with Prisma schema.
ALTER INDEX "TranscodeJob_organizationId_sourceAssetId_kind_status_idx"
RENAME TO "TranscodeJob_organizationId_sourceAssetId_jobKind_status_idx";
