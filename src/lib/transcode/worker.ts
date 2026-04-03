import { execFile } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";

import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

import type { DeliveryFormat, TranscodeJobKind } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { getStorageAdapterFromEnv } from "@/lib/storage/adapter";
import { createTranscodeJobWithActiveDedupe } from "@/lib/transcode/job-dedupe";

import {
  enqueueDeliveryFormatsJob,
  enqueuePreviewClipJob,
} from "./queue";
import type { TranscodeQueueMessage } from "./queue";

const execFileAsync = promisify(execFile);

const DEFAULT_PREVIEW_SECONDS = 30;
const DEFAULT_SOURCE_ROOT = path.join(os.tmpdir(), "merch-table", "source");
const DEFAULT_OUTPUT_ROOT = path.join(os.tmpdir(), "merch-table", "output");
const DEFAULT_RELEASE_DELIVERY_FORMATS: DeliveryFormat[] = ["MP3", "M4A", "FLAC"];
const DEFAULT_STALE_QUEUED_RECOVERY_BATCH_SIZE = 25;
const DEFAULT_STALE_RUNNING_RECOVERY_BATCH_SIZE = 25;
const DEFAULT_RETRY_ENQUEUE_BATCH_SIZE = 25;
const DEFAULT_RETRY_ENQUEUE_FAILURE_DELAY_MS = 10_000;
const DEFAULT_TRANSIENT_RETRY_MAX_ATTEMPTS = 4;
const DEFAULT_TRANSIENT_RETRY_BASE_DELAY_SECONDS = 5;
const DEFAULT_TRANSIENT_RETRY_MAX_DELAY_SECONDS = 120;
const DEFAULT_FFMPEG_TIMEOUT_SECONDS = 15 * 60;

const TRANSIENT_NODE_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ECONNABORTED",
  "EPIPE",
  "ETIMEDOUT",
  "ESOCKETTIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EAI_AGAIN",
]);

const TRANSIENT_MESSAGE_PATTERNS = [
  "temporarily unavailable",
  "resource temporarily unavailable",
  "connection reset",
  "connection refused",
  "timed out",
  "timeout",
  "network is unreachable",
  "no route to host",
  "broken pipe",
  "service unavailable",
  "bad gateway",
  "gateway timeout",
  "too many requests",
  "try again",
];

type AudioMetadata = {
  bitrateKbps: number | null;
  sampleRateHz: number | null;
  channels: number | null;
};

type OutputDefinition = {
  releaseFormat: DeliveryFormat;
  outputFormat: string;
  extension: string;
  mimeType: string;
  isLosslessOutput: boolean;
  assetRole: "PREVIEW" | "DELIVERY";
  ffmpegArgs: (inputPath: string, outputPath: string) => string[];
};

type StaleQueuedRecoveryAction =
  | {
      type: "REQUEUE";
      kind: TranscodeJobKind;
    }
  | {
      type: "FAIL";
      reason: string;
    };

export type StaleQueuedTranscodeRecoverySummary = {
  scanned: number;
  requeued: number;
  failed: number;
  skipped: number;
};

export type StaleRunningTranscodeRecoverySummary = {
  scanned: number;
  requeued: number;
  failed: number;
  skipped: number;
};

export type RetryEnqueueSummary = {
  scanned: number;
  enqueued: number;
  failed: number;
  skipped: number;
};

const DELIVERY_OUTPUTS: OutputDefinition[] = [
  {
    releaseFormat: "MP3",
    outputFormat: "mp3",
    extension: "mp3",
    mimeType: "audio/mpeg",
    isLosslessOutput: false,
    assetRole: "DELIVERY",
    ffmpegArgs: (inputPath, outputPath) => [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      inputPath,
      "-map_metadata",
      "-1",
      "-vn",
      "-codec:a",
      "libmp3lame",
      "-b:a",
      "320k",
      outputPath,
    ],
  },
  {
    releaseFormat: "M4A",
    outputFormat: "m4a",
    extension: "m4a",
    mimeType: "audio/mp4",
    isLosslessOutput: false,
    assetRole: "DELIVERY",
    ffmpegArgs: (inputPath, outputPath) => [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      inputPath,
      "-map_metadata",
      "-1",
      "-vn",
      "-codec:a",
      "aac",
      "-b:a",
      "256k",
      "-movflags",
      "+faststart",
      outputPath,
    ],
  },
  {
    releaseFormat: "FLAC",
    outputFormat: "flac",
    extension: "flac",
    mimeType: "audio/flac",
    isLosslessOutput: true,
    assetRole: "DELIVERY",
    ffmpegArgs: (inputPath, outputPath) => [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      inputPath,
      "-map_metadata",
      "-1",
      "-vn",
      "-codec:a",
      "flac",
      "-compression_level",
      "8",
      outputPath,
    ],
  },
];

function readDirectoryFromEnv(name: string, fallback: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    return fallback;
  }

  return path.resolve(value);
}

function readPositiveIntegerFromEnv(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function readTransientRetryPolicyFromEnv() {
  const maxAttempts = Math.max(
    1,
    readPositiveIntegerFromEnv(
      "TRANSCODE_TRANSIENT_RETRY_MAX_ATTEMPTS",
      DEFAULT_TRANSIENT_RETRY_MAX_ATTEMPTS,
    ),
  );
  const baseDelayMs =
    Math.max(
      1,
      readPositiveIntegerFromEnv(
        "TRANSCODE_TRANSIENT_RETRY_BASE_DELAY_SECONDS",
        DEFAULT_TRANSIENT_RETRY_BASE_DELAY_SECONDS,
      ),
    ) * 1_000;
  const maxDelayMs =
    Math.max(
      1,
      readPositiveIntegerFromEnv(
        "TRANSCODE_TRANSIENT_RETRY_MAX_DELAY_SECONDS",
        DEFAULT_TRANSIENT_RETRY_MAX_DELAY_SECONDS,
      ),
    ) * 1_000;

  return {
    maxAttempts,
    baseDelayMs,
    maxDelayMs: Math.max(baseDelayMs, maxDelayMs),
  } as const;
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message.slice(0, 1_000);
  }

  return "Unknown transcode worker error.";
}

function truncateFailureReason(reason: string) {
  return reason.slice(0, 1_000);
}

function extractErrorCode(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }

  return null;
}

function extractErrorName(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    typeof error.name === "string"
  ) {
    return error.name;
  }

  return null;
}

function extractHttpStatusCode(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "$metadata" in error &&
    typeof error.$metadata === "object" &&
    error.$metadata !== null &&
    "httpStatusCode" in error.$metadata &&
    typeof error.$metadata.httpStatusCode === "number"
  ) {
    return error.$metadata.httpStatusCode;
  }

  return null;
}

function extractErrorDetailText(error: unknown) {
  let detail = "";

  if (error instanceof Error) {
    detail = error.message;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "stderr" in error &&
    typeof error.stderr === "string" &&
    error.stderr.trim().length > 0
  ) {
    detail = `${detail} ${error.stderr}`.trim();
  }

  return detail.toLowerCase();
}

function isTransientTranscodeError(error: unknown) {
  const errorCode = extractErrorCode(error);
  if (errorCode && TRANSIENT_NODE_ERROR_CODES.has(errorCode.toUpperCase())) {
    return true;
  }

  const httpStatusCode = extractHttpStatusCode(error);
  if (
    httpStatusCode !== null &&
    [408, 425, 429, 500, 502, 503, 504].includes(httpStatusCode)
  ) {
    return true;
  }

  const errorName = extractErrorName(error)?.toLowerCase() ?? "";
  if (
    errorName.includes("timeout") ||
    errorName.includes("throttle") ||
    errorName.includes("network")
  ) {
    return true;
  }

  const detail = extractErrorDetailText(error);
  if (
    TRANSIENT_MESSAGE_PATTERNS.some((pattern) =>
      detail.includes(pattern),
    )
  ) {
    return true;
  }

  return false;
}

function resolveRetryBackoffDelayMs(input: {
  attemptCount: number;
  baseDelayMs: number;
  maxDelayMs: number;
}) {
  const exponent = Math.max(0, input.attemptCount - 1);
  const rawDelayMs = Math.min(
    input.maxDelayMs,
    input.baseDelayMs * Math.pow(2, exponent),
  );
  const jitterFactor = 0.85 + Math.random() * 0.3;
  return Math.max(1_000, Math.round(rawDelayMs * jitterFactor));
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

function resolveEffectiveDeliveryFormats(formats: DeliveryFormat[]) {
  return formats.length > 0 ? formats : DEFAULT_RELEASE_DELIVERY_FORMATS;
}

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

async function maybeQueueDeliveryReconcileJob(input: {
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

function resolveSourceExtension(input: { format: string; storageKey: string }) {
  const format = input.format.trim().toLowerCase();
  if (format.length > 0 && /^[a-z0-9]+$/.test(format)) {
    return format;
  }

  const fromKey = path.extname(input.storageKey).toLowerCase().replace(".", "");
  if (fromKey.length > 0) {
    return fromKey;
  }

  return "bin";
}

function readPositiveIntegerSecondsFromEnv(name: string, fallback: number) {
  return readPositiveIntegerFromEnv(name, fallback);
}

async function runFfmpeg(args: string[]) {
  const timeoutMs =
    Math.max(
      1,
      readPositiveIntegerSecondsFromEnv(
        "TRANSCODE_FFMPEG_TIMEOUT_SECONDS",
        DEFAULT_FFMPEG_TIMEOUT_SECONDS,
      ),
    ) * 1_000;

  await execFileAsync("ffmpeg", args, {
    maxBuffer: 10 * 1024 * 1024,
    timeout: timeoutMs,
    killSignal: "SIGKILL",
  });
}

async function readAudioMetadata(filePath: string): Promise<AudioMetadata> {
  const { stdout } = await execFileAsync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_entries",
      "stream=bit_rate,sample_rate,channels",
      "-of",
      "json",
      filePath,
    ],
    { maxBuffer: 2 * 1024 * 1024 },
  );

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return {
      bitrateKbps: null,
      sampleRateHz: null,
      channels: null,
    };
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("streams" in parsed) ||
    !Array.isArray(parsed.streams) ||
    parsed.streams.length === 0 ||
    !parsed.streams[0] ||
    typeof parsed.streams[0] !== "object"
  ) {
    return {
      bitrateKbps: null,
      sampleRateHz: null,
      channels: null,
    };
  }

  const stream = parsed.streams[0] as {
    bit_rate?: string | number;
    sample_rate?: string | number;
    channels?: string | number;
  };

  const bitrate = Number(stream.bit_rate);
  const sampleRate = Number(stream.sample_rate);
  const channels = Number(stream.channels);

  return {
    bitrateKbps:
      Number.isFinite(bitrate) && bitrate > 0 ? Math.round(bitrate / 1_000) : null,
    sampleRateHz:
      Number.isFinite(sampleRate) && sampleRate > 0 ? Math.round(sampleRate) : null,
    channels: Number.isFinite(channels) && channels > 0 ? Math.round(channels) : null,
  };
}

async function readAudioDurationSeconds(filePath: string): Promise<number | null> {
  const { stdout } = await execFileAsync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ],
    { maxBuffer: 512 * 1024 },
  );

  const parsed = Number(stdout.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

async function writeBodyToFile(body: unknown, targetPath: string) {
  if (
    typeof body === "object" &&
    body !== null &&
    "transformToByteArray" in body &&
    typeof body.transformToByteArray === "function"
  ) {
    const bytes = await body.transformToByteArray();
    await fs.writeFile(targetPath, Buffer.from(bytes));
    return;
  }

  if (
    typeof body === "object" &&
    body !== null &&
    "pipe" in body &&
    typeof body.pipe === "function"
  ) {
    await pipeline(body as NodeJS.ReadableStream, createWriteStream(targetPath));
    return;
  }

  throw new Error("Storage download response did not contain a readable body.");
}

async function uploadFileToStorage(input: {
  storageKey: string;
  contentType: string;
  filePath: string;
}) {
  const storage = getStorageAdapterFromEnv();
  await storage.getClient().send(
    new PutObjectCommand({
      Bucket: storage.bucket,
      Key: input.storageKey,
      ContentType: input.contentType,
      Body: createReadStream(input.filePath),
    }),
  );
}

async function removeStalePreviewAssets(input: {
  trackId: string;
  keepStorageKey: string;
}) {
  const staleAssets = await prisma.trackAsset.findMany({
    where: {
      trackId: input.trackId,
      assetRole: "PREVIEW",
      storageKey: {
        not: input.keepStorageKey,
      },
    },
    select: {
      id: true,
      storageKey: true,
    },
  });

  if (staleAssets.length === 0) {
    return;
  }

  const storage = getStorageAdapterFromEnv();
  const client = storage.getClient();
  const deletableIds: string[] = [];

  for (const asset of staleAssets) {
    try {
      await client.send(
        new DeleteObjectCommand({
          Bucket: storage.bucket,
          Key: asset.storageKey,
        }),
      );
      deletableIds.push(asset.id);
    } catch {
      // Keep DB records for previews we could not delete from storage.
    }
  }

  if (deletableIds.length === 0) {
    return;
  }

  await prisma.trackAsset.deleteMany({
    where: {
      id: {
        in: deletableIds,
      },
    },
  });
}

function resolvePreviewStorageKey(input: {
  trackId: string;
  sourceAssetId: string;
  previewSeconds: number;
}) {
  return `generated/previews/${input.trackId}/${input.sourceAssetId}-${input.previewSeconds}s.mp3`;
}

function resolveDeliveryStorageKey(input: {
  trackId: string;
  sourceAssetId: string;
  extension: string;
}) {
  return `generated/delivery/${input.trackId}/${input.sourceAssetId}.${input.extension}`;
}

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

async function persistOutputRecord(input: {
  jobId: string;
  trackId: string;
  storageKey: string;
  outputFormat: string;
  mimeType: string;
  filePath: string;
  isLossless: boolean;
  assetRole: "PREVIEW" | "DELIVERY";
}) {
  const stat = await fs.stat(input.filePath);
  const metadata = await readAudioMetadata(input.filePath);

  return prisma.$transaction(async (tx) => {
    const existingAsset = await tx.trackAsset.findUnique({
      where: {
        trackId_storageKey: {
          trackId: input.trackId,
          storageKey: input.storageKey,
        },
      },
      select: {
        id: true,
      },
    });

    const asset = await tx.trackAsset.upsert({
      where: {
        trackId_storageKey: {
          trackId: input.trackId,
          storageKey: input.storageKey,
        },
      },
      create: {
        trackId: input.trackId,
        storageKey: input.storageKey,
        format: input.outputFormat,
        mimeType: input.mimeType,
        fileSizeBytes: stat.size,
        bitrateKbps: metadata.bitrateKbps,
        sampleRateHz: metadata.sampleRateHz,
        channels: metadata.channels,
        isLossless: input.isLossless,
        assetRole: input.assetRole,
      },
      update: {
        format: input.outputFormat,
        mimeType: input.mimeType,
        fileSizeBytes: stat.size,
        bitrateKbps: metadata.bitrateKbps,
        sampleRateHz: metadata.sampleRateHz,
        channels: metadata.channels,
        isLossless: input.isLossless,
        assetRole: input.assetRole,
      },
      select: {
        id: true,
      },
    });

    await tx.transcodeOutput.upsert({
      where: {
        jobId_format: {
          jobId: input.jobId,
          format: input.outputFormat,
        },
      },
      create: {
        jobId: input.jobId,
        outputAssetId: asset.id,
        format: input.outputFormat,
        storageKey: input.storageKey,
        mimeType: input.mimeType,
        fileSizeBytes: stat.size,
      },
      update: {
        outputAssetId: asset.id,
        storageKey: input.storageKey,
        mimeType: input.mimeType,
        fileSizeBytes: stat.size,
      },
    });

    return {
      outputAssetId: asset.id,
      createdTrackAsset: !existingAsset,
    };
  });
}

type DeliveryOutputRollbackCandidate = {
  outputFormat: string;
  storageKey: string;
  outputAssetId: string;
  createdTrackAsset: boolean;
};

async function cleanupPartialDeliveryOutputs(input: {
  jobId: string;
  processedOutputs: DeliveryOutputRollbackCandidate[];
}) {
  if (input.processedOutputs.length === 0) {
    return;
  }

  const processedFormats = [...new Set(input.processedOutputs.map((output) => output.outputFormat))];

  await prisma.transcodeOutput
    .deleteMany({
      where: {
        jobId: input.jobId,
        format: {
          in: processedFormats,
        },
      },
    })
    .catch(() => undefined);

  const createdAssets = input.processedOutputs.filter((output) => output.createdTrackAsset);
  if (createdAssets.length === 0) {
    return;
  }

  const storage = getStorageAdapterFromEnv();
  const client = storage.getClient();
  const uniqueCreatedAssets = new Map(
    createdAssets.map((asset) => [asset.outputAssetId, asset.storageKey]),
  );

  for (const [assetId, storageKey] of uniqueCreatedAssets) {
    await client
      .send(
        new DeleteObjectCommand({
          Bucket: storage.bucket,
          Key: storageKey,
        }),
      )
      .catch(() => undefined);

    await prisma.trackAsset
      .deleteMany({
        where: {
          id: assetId,
          outputRecords: {
            none: {},
          },
          sourceJobs: {
            none: {},
          },
        },
      })
      .catch(() => undefined);
  }
}

async function processPreviewJob(input: {
  jobId: string;
  trackId: string;
  sourceAssetId: string;
  sourcePath: string;
  previewSeconds: number;
  outputRoot: string;
}) {
  const safePreviewSeconds = Math.max(5, Math.round(input.previewSeconds));
  const sourceDurationSeconds = await readAudioDurationSeconds(input.sourcePath);
  const clipDurationSeconds = sourceDurationSeconds
    ? Math.max(1, Math.min(safePreviewSeconds, sourceDurationSeconds))
    : safePreviewSeconds;
  const fadeSeconds =
    clipDurationSeconds > 1
      ? Math.max(0.15, Math.min(1.5, clipDurationSeconds / 4))
      : 0;
  const fadeOutStart = Math.max(0, clipDurationSeconds - fadeSeconds);
  const randomStartSeconds = (() => {
    if (!sourceDurationSeconds) {
      return 0;
    }

    const maxStart = Math.max(0, sourceDurationSeconds - clipDurationSeconds);
    if (maxStart <= 0) {
      return 0;
    }

    // Prefer a middle section and avoid obvious intros/outros.
    const middleMin = Math.max(0, sourceDurationSeconds * 0.2);
    const middleMax = Math.max(middleMin, sourceDurationSeconds * 0.8 - clipDurationSeconds);
    if (middleMax <= middleMin) {
      return maxStart / 2;
    }

    const candidate = middleMin + Math.random() * (middleMax - middleMin);
    return Math.min(maxStart, Math.max(0, candidate));
  })();
  const outputFilePath = path.join(input.outputRoot, `${input.jobId}-preview.mp3`);

  await runFfmpeg([
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-ss",
    randomStartSeconds.toFixed(3),
    "-i",
    input.sourcePath,
    "-t",
    clipDurationSeconds.toFixed(3),
    "-map",
    "0:a:0",
    "-map_metadata",
    "-1",
    "-vn",
    ...(fadeSeconds > 0
      ? [
          "-af",
          `afade=t=in:st=0:d=${fadeSeconds.toFixed(3)},afade=t=out:st=${fadeOutStart.toFixed(3)}:d=${fadeSeconds.toFixed(3)}`,
        ]
      : []),
    "-codec:a",
    "libmp3lame",
    "-b:a",
    "192k",
    outputFilePath,
  ]);

  const storageKey = resolvePreviewStorageKey({
    trackId: input.trackId,
    sourceAssetId: input.sourceAssetId,
    previewSeconds: safePreviewSeconds,
  });

  await uploadFileToStorage({
    storageKey,
    contentType: "audio/mpeg",
    filePath: outputFilePath,
  });

  await persistOutputRecord({
    jobId: input.jobId,
    trackId: input.trackId,
    storageKey,
    outputFormat: "mp3",
    mimeType: "audio/mpeg",
    filePath: outputFilePath,
    isLossless: false,
    assetRole: "PREVIEW",
  });

  await removeStalePreviewAssets({
    trackId: input.trackId,
    keepStorageKey: storageKey,
  });
}

async function processDeliveryFormatsJob(input: {
  jobId: string;
  trackId: string;
  sourceAssetId: string;
  sourcePath: string;
  outputRoot: string;
  releaseFormats: DeliveryFormat[];
}) {
  const selectedFormats = new Set(input.releaseFormats);
  const selectedOutputs = DELIVERY_OUTPUTS.filter((output) =>
    selectedFormats.has(output.releaseFormat),
  );

  if (selectedOutputs.length === 0) {
    throw new Error("Release has no enabled delivery formats.");
  }

  const processedOutputs: DeliveryOutputRollbackCandidate[] = [];

  try {
    for (const output of selectedOutputs) {
      const outputPath = path.join(input.outputRoot, `${input.jobId}.${output.extension}`);

      await runFfmpeg(output.ffmpegArgs(input.sourcePath, outputPath));

      const storageKey = resolveDeliveryStorageKey({
        trackId: input.trackId,
        sourceAssetId: input.sourceAssetId,
        extension: output.extension,
      });

      await uploadFileToStorage({
        storageKey,
        contentType: output.mimeType,
        filePath: outputPath,
      });

      const persisted = await persistOutputRecord({
        jobId: input.jobId,
        trackId: input.trackId,
        storageKey,
        outputFormat: output.outputFormat,
        mimeType: output.mimeType,
        filePath: outputPath,
        isLossless: output.isLosslessOutput,
        assetRole: output.assetRole,
      });

      processedOutputs.push({
        outputFormat: output.outputFormat,
        storageKey,
        outputAssetId: persisted.outputAssetId,
        createdTrackAsset: persisted.createdTrackAsset,
      });
    }
  } catch (error) {
    await cleanupPartialDeliveryOutputs({
      jobId: input.jobId,
      processedOutputs,
    });
    throw error;
  }
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
