import type { DeliveryFormat, TranscodeJobKind } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { createTranscodeJobWithActiveDedupe } from "@/lib/transcode/job-dedupe";

import { enqueueDeliveryFormatsJob, enqueuePreviewClipJob } from "./queue";
import {
  DEFAULT_RETRY_ENQUEUE_BATCH_SIZE,
  DEFAULT_RETRY_ENQUEUE_FAILURE_DELAY_MS,
  DEFAULT_STALE_QUEUED_RECOVERY_BATCH_SIZE,
  DEFAULT_STALE_RUNNING_RECOVERY_BATCH_SIZE,
  resolveEffectiveDeliveryFormats,
  toErrorMessage,
  truncateFailureReason,
} from "./worker-runtime";

type StaleQueuedRecoveryAction = { type: "REQUEUE"; kind: TranscodeJobKind } | { type: "FAIL"; reason: string };

export type StaleQueuedTranscodeRecoverySummary = { scanned: number; requeued: number; failed: number; skipped: number };
export type StaleRunningTranscodeRecoverySummary = { scanned: number; requeued: number; failed: number; skipped: number };
export type RetryEnqueueSummary = { scanned: number; enqueued: number; failed: number; skipped: number };

function canonicalizeDeliveryFormats(formats: DeliveryFormat[]) {
  return [...new Set(formats)].sort().join("|");
}

function didDeliveryFormatsChange(input: {
  before: DeliveryFormat[];
  after: DeliveryFormat[];
}) {
  return (
    canonicalizeDeliveryFormats(input.before) !==
    canonicalizeDeliveryFormats(input.after)
  );
}

export async function maybeQueueDeliveryReconcileJob(input: {
  organizationId: string;
  trackId: string;
  sourceAssetId: string;
  releaseId: string;
  processedFormats: DeliveryFormat[];
}) {
  const release = await prisma.release.findUnique({
    where: {
      id: input.releaseId,
    },
    select: {
      deliveryFormats: true,
    },
  });

  if (!release) {
    return false;
  }

  const latestFormats = resolveEffectiveDeliveryFormats(release.deliveryFormats);
  if (
    !didDeliveryFormatsChange({
      before: input.processedFormats,
      after: latestFormats,
    })
  ) {
    return false;
  }

  const followUp = await prisma.$transaction(async (tx) =>
    createTranscodeJobWithActiveDedupe(tx, {
      organizationId: input.organizationId,
      trackId: input.trackId,
      sourceAssetId: input.sourceAssetId,
      jobKind: "DELIVERY_FORMATS",
    }),
  );

  if (!followUp.created) {
    return false;
  }

  try {
    await enqueueDeliveryFormatsJob(followUp.jobId);
  } catch (error) {
    const retryAt = new Date(Date.now() + DEFAULT_RETRY_ENQUEUE_FAILURE_DELAY_MS);
    await prisma.transcodeJob
      .updateMany({
        where: {
          id: followUp.jobId,
          status: "QUEUED",
        },
        data: {
          nextRetryAt: retryAt,
          errorMessage: truncateFailureReason(
            `Could not enqueue delivery reconcile job yet; will retry queueing shortly. Last error: ${toErrorMessage(error)}`,
          ),
        },
      })
      .catch(() => undefined);
  }

  return true;
}

function resolveStaleQueuedRecoveryAction(input: {
  jobKind: TranscodeJobKind;
  previewMode: "CLIP" | "FULL";
  isLossless: boolean;
}): StaleQueuedRecoveryAction {
  if (input.jobKind === "PREVIEW_CLIP") {
    if (input.previewMode !== "CLIP") {
      return {
        type: "FAIL",
        reason:
          "Stale queued preview job is no longer valid because the track preview mode changed to FULL. Queue a new preview clip job if needed.",
      };
    }

    return {
      type: "REQUEUE",
      kind: "PREVIEW_CLIP",
    };
  }

  if (!input.isLossless) {
    return {
      type: "FAIL",
      reason:
        "Stale queued delivery transcode job could not be auto-requeued because delivery jobs require a lossless source asset. Upload a lossless master, then queue a new delivery job.",
    };
  }

  return {
    type: "REQUEUE",
    kind: "DELIVERY_FORMATS",
  };
}

async function markQueuedJobFailedIfStillQueued(input: {
  jobId: string;
  errorMessage: string;
}) {
  const failed = await prisma.transcodeJob.updateMany({
    where: {
      id: input.jobId,
      status: "QUEUED",
    },
    data: {
      status: "FAILED",
      errorMessage: truncateFailureReason(input.errorMessage),
      startedAt: null,
      finishedAt: new Date(),
    },
  });

  return failed.count > 0;
}

export async function recoverStaleQueuedTranscodeJobs(input: {
  staleAfterSeconds: number;
  maxJobs?: number;
  now?: Date;
  organizationId?: string;
}): Promise<StaleQueuedTranscodeRecoverySummary> {
  const staleAfterSeconds = Math.max(1, Math.floor(input.staleAfterSeconds));
  const maxJobs = Math.max(
    1,
    Math.floor(input.maxJobs ?? DEFAULT_STALE_QUEUED_RECOVERY_BATCH_SIZE),
  );
  const now = input.now ?? new Date();
  const staleBefore = new Date(now.getTime() - staleAfterSeconds * 1_000);

  const staleJobs = await prisma.transcodeJob.findMany({
    where: {
      organizationId: input.organizationId,
      status: "QUEUED",
      nextRetryAt: null,
      queuedAt: {
        lt: staleBefore,
      },
    },
    orderBy: [
      {
        queuedAt: "asc",
      },
    ],
    take: maxJobs,
    select: {
      id: true,
      queuedAt: true,
      jobKind: true,
      track: {
        select: {
          previewMode: true,
        },
      },
      sourceAsset: {
        select: {
          isLossless: true,
        },
      },
    },
  });

  let requeued = 0;
  let failed = 0;
  let skipped = 0;

  for (const staleJob of staleJobs) {
    const requeueTimestamp = new Date();
    const claim = await prisma.transcodeJob.updateMany({
      where: {
        id: staleJob.id,
        status: "QUEUED",
        nextRetryAt: null,
        queuedAt: staleJob.queuedAt,
      },
      data: {
        queuedAt: requeueTimestamp,
        startedAt: null,
        finishedAt: null,
        errorMessage: null,
      },
    });

    if (claim.count === 0) {
      skipped += 1;
      continue;
    }

    const action = resolveStaleQueuedRecoveryAction({
      jobKind: staleJob.jobKind,
      previewMode: staleJob.track.previewMode,
      isLossless: staleJob.sourceAsset.isLossless,
    });

    if (action.type === "FAIL") {
      const didFail = await markQueuedJobFailedIfStillQueued({
        jobId: staleJob.id,
        errorMessage: action.reason,
      });
      if (didFail) {
        failed += 1;
      } else {
        skipped += 1;
      }
      continue;
    }

    try {
      if (action.kind === "PREVIEW_CLIP") {
        await enqueuePreviewClipJob(staleJob.id);
      } else {
        await enqueueDeliveryFormatsJob(staleJob.id);
      }
      requeued += 1;
    } catch (error) {
      const didFail = await markQueuedJobFailedIfStillQueued({
        jobId: staleJob.id,
        errorMessage: `Stale queued transcode job could not be re-enqueued: ${toErrorMessage(error)}`,
      });
      if (didFail) {
        failed += 1;
      } else {
        skipped += 1;
      }
    }
  }

  return {
    scanned: staleJobs.length,
    requeued,
    failed,
    skipped,
  };
}

export async function recoverStaleRunningTranscodeJobs(input: {
  staleAfterSeconds: number;
  maxJobs?: number;
  now?: Date;
  organizationId?: string;
}): Promise<StaleRunningTranscodeRecoverySummary> {
  const staleAfterSeconds = Math.max(1, Math.floor(input.staleAfterSeconds));
  const maxJobs = Math.max(
    1,
    Math.floor(input.maxJobs ?? DEFAULT_STALE_RUNNING_RECOVERY_BATCH_SIZE),
  );
  const now = input.now ?? new Date();
  const staleBefore = new Date(now.getTime() - staleAfterSeconds * 1_000);

  const staleJobs = await prisma.transcodeJob.findMany({
    where: {
      organizationId: input.organizationId,
      status: "RUNNING",
      startedAt: {
        lt: staleBefore,
      },
    },
    orderBy: [
      {
        startedAt: "asc",
      },
    ],
    take: maxJobs,
    select: {
      id: true,
      startedAt: true,
      jobKind: true,
      track: {
        select: {
          previewMode: true,
        },
      },
      sourceAsset: {
        select: {
          isLossless: true,
        },
      },
    },
  });

  let requeued = 0;
  let failed = 0;
  let skipped = 0;

  for (const staleJob of staleJobs) {
    if (!staleJob.startedAt) {
      skipped += 1;
      continue;
    }

    const queuedAt = new Date();
    const claim = await prisma.transcodeJob.updateMany({
      where: {
        id: staleJob.id,
        status: "RUNNING",
        startedAt: staleJob.startedAt,
      },
      data: {
        status: "QUEUED",
        queuedAt,
        startedAt: null,
        finishedAt: null,
        nextRetryAt: null,
        errorMessage: truncateFailureReason(
          `Recovered stale running transcode attempt after exceeding ${staleAfterSeconds}s runtime. Requeueing.`,
        ),
      },
    });

    if (claim.count === 0) {
      skipped += 1;
      continue;
    }

    const action = resolveStaleQueuedRecoveryAction({
      jobKind: staleJob.jobKind,
      previewMode: staleJob.track.previewMode,
      isLossless: staleJob.sourceAsset.isLossless,
    });

    if (action.type === "FAIL") {
      const didFail = await markQueuedJobFailedIfStillQueued({
        jobId: staleJob.id,
        errorMessage: action.reason,
      });
      if (didFail) {
        failed += 1;
      } else {
        skipped += 1;
      }
      continue;
    }

    try {
      if (action.kind === "PREVIEW_CLIP") {
        await enqueuePreviewClipJob(staleJob.id);
      } else {
        await enqueueDeliveryFormatsJob(staleJob.id);
      }
      requeued += 1;
    } catch (error) {
      const didFail = await markQueuedJobFailedIfStillQueued({
        jobId: staleJob.id,
        errorMessage: `Recovered stale running transcode job could not be re-enqueued: ${toErrorMessage(error)}`,
      });
      if (didFail) {
        failed += 1;
      } else {
        skipped += 1;
      }
    }
  }

  return {
    scanned: staleJobs.length,
    requeued,
    failed,
    skipped,
  };
}

export async function enqueueDueQueuedRetryJobs(input?: {
  maxJobs?: number;
  now?: Date;
  organizationId?: string;
}): Promise<RetryEnqueueSummary> {
  const maxJobs = Math.max(
    1,
    Math.floor(input?.maxJobs ?? DEFAULT_RETRY_ENQUEUE_BATCH_SIZE),
  );
  const now = input?.now ?? new Date();

  const dueJobs = await prisma.transcodeJob.findMany({
    where: {
      organizationId: input?.organizationId,
      status: "QUEUED",
      nextRetryAt: {
        lte: now,
      },
    },
    orderBy: [{ nextRetryAt: "asc" }, { queuedAt: "asc" }],
    take: maxJobs,
    select: {
      id: true,
      jobKind: true,
      nextRetryAt: true,
    },
  });

  let enqueued = 0;
  let failed = 0;
  let skipped = 0;

  for (const dueJob of dueJobs) {
    if (!dueJob.nextRetryAt) {
      skipped += 1;
      continue;
    }

    const claim = await prisma.transcodeJob.updateMany({
      where: {
        id: dueJob.id,
        status: "QUEUED",
        nextRetryAt: dueJob.nextRetryAt,
      },
      data: {
        nextRetryAt: null,
        queuedAt: new Date(),
      },
    });

    if (claim.count === 0) {
      skipped += 1;
      continue;
    }

    try {
      if (dueJob.jobKind === "PREVIEW_CLIP") {
        await enqueuePreviewClipJob(dueJob.id);
      } else {
        await enqueueDeliveryFormatsJob(dueJob.id);
      }
      enqueued += 1;
    } catch (error) {
      const rescheduleAt = new Date(Date.now() + DEFAULT_RETRY_ENQUEUE_FAILURE_DELAY_MS);
      await prisma.transcodeJob.updateMany({
        where: {
          id: dueJob.id,
          status: "QUEUED",
          nextRetryAt: null,
        },
        data: {
          nextRetryAt: rescheduleAt,
          errorMessage: truncateFailureReason(
            `Retry enqueue failed; will retry queueing shortly. Last error: ${toErrorMessage(error)}`,
          ),
        },
      });
      failed += 1;
    }
  }

  return {
    scanned: dueJobs.length,
    enqueued,
    failed,
    skipped,
  };
}
