import { promises as fs } from "node:fs";
import path from "node:path";

import { GetObjectCommand } from "@aws-sdk/client-s3";

import { logEvent } from "@/lib/logging";
import { prisma } from "@/lib/prisma";
import { getStorageAdapterFromEnv } from "@/lib/storage/adapter";

import type { TranscodeQueueMessage } from "./queue";
import {
  DEFAULT_PREVIEW_SECONDS,
  DEFAULT_OUTPUT_ROOT,
  DEFAULT_SOURCE_ROOT,
  isTransientTranscodeError,
  readDirectoryFromEnv,
  readTransientRetryPolicyFromEnv,
  resolveEffectiveDeliveryFormats,
  resolveRetryBackoffDelayMs,
  resolveSourceExtension,
  toErrorMessage,
  truncateFailureReason,
} from "./worker-runtime";
import {
  processDeliveryFormatsJob,
  processPreviewJob,
} from "./worker-job-processing";
import { writeBodyToFile } from "./worker-media-io";
import { maybeQueueDeliveryReconcileJob } from "./worker-recovery";

async function markJobFailed(jobId: string, errorMessage: string) {
  const failed = await prisma.transcodeJob.updateMany({
    where: {
      id: jobId,
      status: "RUNNING",
    },
    data: {
      status: "FAILED",
      errorMessage,
      finishedAt: new Date(),
    },
  });

  return failed.count > 0;
}

async function scheduleTransientRetry(input: {
  jobId: string;
  attemptCount: number;
  maxAttempts: number;
  delayMs: number;
  errorMessage: string;
}) {
  const retryAt = new Date(Date.now() + input.delayMs);
  const retryInSeconds = Math.max(1, Math.ceil(input.delayMs / 1_000));

  const updated = await prisma.transcodeJob.updateMany({
    where: {
      id: input.jobId,
      status: "RUNNING",
    },
    data: {
      status: "QUEUED",
      queuedAt: new Date(),
      nextRetryAt: retryAt,
      startedAt: null,
      finishedAt: null,
      errorMessage: truncateFailureReason(
        `Transient transcode failure (attempt ${input.attemptCount}/${input.maxAttempts}). Retrying in ${retryInSeconds}s. Last error: ${input.errorMessage}`,
      ),
    },
  });

  return updated.count > 0;
}

export async function processTranscodeQueueMessage(message: TranscodeQueueMessage) {
  const claimTimestamp = new Date();
  const claim = await prisma.transcodeJob.updateMany({
    where: {
      id: message.jobId,
      status: "QUEUED",
      OR: [
        { nextRetryAt: null },
        {
          nextRetryAt: {
            lte: claimTimestamp,
          },
        },
      ],
    },
    data: {
      status: "RUNNING",
      startedAt: claimTimestamp,
      finishedAt: null,
      errorMessage: null,
      nextRetryAt: null,
      attemptCount: {
        increment: 1,
      },
    },
  });

  if (claim.count === 0) {
    return;
  }

  const job = await prisma.transcodeJob.findUnique({
    where: {
      id: message.jobId,
    },
    select: {
      id: true,
      organizationId: true,
      trackId: true,
      sourceAssetId: true,
      jobKind: true,
      attemptCount: true,
      track: {
        select: {
          id: true,
          previewSeconds: true,
          release: {
            select: {
              id: true,
              deliveryFormats: true,
            },
          },
        },
      },
      sourceAsset: {
        select: {
          id: true,
          trackId: true,
          storageKey: true,
          format: true,
          isLossless: true,
        },
      },
    },
  });

  if (!job || !job.track || !job.sourceAsset) {
    await markJobFailed(message.jobId, "Transcode job is missing track or source asset state.");
    return;
  }

  if (job.sourceAsset.trackId !== job.trackId) {
    await markJobFailed(message.jobId, "Source asset does not belong to this track.");
    return;
  }

  const effectiveKind = job.jobKind;

  if (effectiveKind === "DELIVERY_FORMATS" && !job.sourceAsset.isLossless) {
    await markJobFailed(message.jobId, "Delivery transcode requires a lossless source asset.");
    return;
  }

  const releaseDeliveryFormats = resolveEffectiveDeliveryFormats(
    job.track.release.deliveryFormats,
  );

  const sourceRoot = readDirectoryFromEnv("TRANSCODE_SOURCE_ROOT", DEFAULT_SOURCE_ROOT);
  const outputRoot = readDirectoryFromEnv("TRANSCODE_OUTPUT_ROOT", DEFAULT_OUTPUT_ROOT);

  await fs.mkdir(sourceRoot, { recursive: true });
  await fs.mkdir(outputRoot, { recursive: true });

  const sourceExtension = resolveSourceExtension({
    format: job.sourceAsset.format,
    storageKey: job.sourceAsset.storageKey,
  });
  const sourcePath = path.join(sourceRoot, `${job.id}.${sourceExtension}`);
  const jobOutputRoot = path.join(outputRoot, job.id);

  try {
    await fs.mkdir(jobOutputRoot, { recursive: true });

    const storage = getStorageAdapterFromEnv();
    const object = await storage.getClient().send(
      new GetObjectCommand({
        Bucket: storage.bucket,
        Key: job.sourceAsset.storageKey,
      }),
    );

    if (!object.Body) {
      throw new Error("Source storage object could not be downloaded.");
    }

    await writeBodyToFile(object.Body, sourcePath);

    if (effectiveKind === "PREVIEW_CLIP") {
      await processPreviewJob({
        jobId: job.id,
        trackId: job.trackId,
        sourceAssetId: job.sourceAssetId,
        sourcePath,
        previewSeconds: job.track.previewSeconds ?? DEFAULT_PREVIEW_SECONDS,
        outputRoot: jobOutputRoot,
      });
    } else {
      await processDeliveryFormatsJob({
        jobId: job.id,
        trackId: job.trackId,
        sourceAssetId: job.sourceAssetId,
        sourcePath,
        outputRoot: jobOutputRoot,
        releaseFormats: releaseDeliveryFormats,
      });
    }

    const markedSucceeded = await prisma.transcodeJob.updateMany({
      where: {
        id: job.id,
        status: "RUNNING",
      },
      data: {
        status: "SUCCEEDED",
        errorMessage: null,
        finishedAt: new Date(),
        nextRetryAt: null,
      },
    });

    if (markedSucceeded.count === 0) {
      return;
    }

    logEvent("info", "transcode.completed", {
      jobId: job.id,
      kind: effectiveKind,
      trackId: job.trackId,
      sourceAssetId: job.sourceAssetId,
    });

    if (effectiveKind === "DELIVERY_FORMATS") {
      await maybeQueueDeliveryReconcileJob({
        organizationId: job.organizationId,
        trackId: job.trackId,
        sourceAssetId: job.sourceAssetId,
        releaseId: job.track.release.id,
        processedFormats: releaseDeliveryFormats,
      });
    }
  } catch (error) {
    const errorMessage = toErrorMessage(error);
    const retryPolicy = readTransientRetryPolicyFromEnv();
    if (isTransientTranscodeError(error) && job.attemptCount < retryPolicy.maxAttempts) {
      const retryDelayMs = resolveRetryBackoffDelayMs({
        attemptCount: job.attemptCount,
        baseDelayMs: retryPolicy.baseDelayMs,
        maxDelayMs: retryPolicy.maxDelayMs,
      });
      const didScheduleRetry = await scheduleTransientRetry({
        jobId: job.id,
        attemptCount: job.attemptCount,
        maxAttempts: retryPolicy.maxAttempts,
        delayMs: retryDelayMs,
        errorMessage,
      });

      if (didScheduleRetry) {
        return;
      }
    }

    await markJobFailed(job.id, errorMessage);
    throw error;
  } finally {
    await fs.rm(sourcePath, { force: true }).catch(() => undefined);
    await fs.rm(jobOutputRoot, { force: true, recursive: true }).catch(() => undefined);
  }
}
