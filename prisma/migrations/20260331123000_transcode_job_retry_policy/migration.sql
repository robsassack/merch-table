-- Add retry tracking fields used for capped backoff retries.
ALTER TABLE "TranscodeJob"
ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "nextRetryAt" TIMESTAMP(3);

CREATE INDEX "TranscodeJob_status_nextRetryAt_queuedAt_idx"
ON "TranscodeJob" ("status", "nextRetryAt", "queuedAt");
