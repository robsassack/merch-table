import { NextResponse } from "next/server";

import { requireAdminRequestContext } from "@/lib/admin/request-context";
import { enforceCsrfProtection } from "@/lib/security/csrf";
import {
  enqueueDueQueuedRetryJobs,
  recoverStaleQueuedTranscodeJobs,
  recoverStaleRunningTranscodeJobs,
} from "@/lib/transcode/worker";

export const runtime = "nodejs";

const DEFAULT_STALE_QUEUED_THRESHOLD_SECONDS = 900;
const DEFAULT_STALE_RUNNING_THRESHOLD_SECONDS = 1800;
const DEFAULT_STALE_RECOVERY_BATCH_SIZE = 25;
const DEFAULT_RETRY_ENQUEUE_BATCH_SIZE = 25;

function parsePositiveInteger(raw: string | undefined, fallback: number) {
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

export async function POST(request: Request) {
  const csrfError = enforceCsrfProtection(request);
  if (csrfError) {
    return csrfError;
  }

  const auth = await requireAdminRequestContext();
  if (!auth.ok) {
    return auth.response;
  }

  const organizationId = auth.context.organizationId;
  const staleQueuedThresholdSeconds = parsePositiveInteger(
    process.env.TRANSCODE_STALE_QUEUED_THRESHOLD_SECONDS,
    DEFAULT_STALE_QUEUED_THRESHOLD_SECONDS,
  );
  const staleRunningThresholdSeconds = parsePositiveInteger(
    process.env.TRANSCODE_STALE_RUNNING_THRESHOLD_SECONDS,
    DEFAULT_STALE_RUNNING_THRESHOLD_SECONDS,
  );
  const staleRecoveryBatchSize = parsePositiveInteger(
    process.env.TRANSCODE_STALE_RECOVERY_BATCH_SIZE,
    DEFAULT_STALE_RECOVERY_BATCH_SIZE,
  );
  const retryEnqueueBatchSize = parsePositiveInteger(
    process.env.TRANSCODE_RETRY_ENQUEUE_BATCH_SIZE,
    DEFAULT_RETRY_ENQUEUE_BATCH_SIZE,
  );

  const [queuedSummary, runningSummary, retrySummary] = await Promise.all([
    recoverStaleQueuedTranscodeJobs({
      staleAfterSeconds: staleQueuedThresholdSeconds,
      maxJobs: staleRecoveryBatchSize,
      organizationId,
    }),
    recoverStaleRunningTranscodeJobs({
      staleAfterSeconds: staleRunningThresholdSeconds,
      maxJobs: staleRecoveryBatchSize,
      organizationId,
    }),
    enqueueDueQueuedRetryJobs({
      maxJobs: retryEnqueueBatchSize,
      organizationId,
    }),
  ]);

  return NextResponse.json({
    ok: true,
    summary: {
      staleQueued: queuedSummary,
      staleRunning: runningSummary,
      retryDue: retrySummary,
      thresholds: {
        staleQueuedThresholdSeconds,
        staleRunningThresholdSeconds,
      },
      batchSizes: {
        staleRecoveryBatchSize,
        retryEnqueueBatchSize,
      },
    },
  });
}
