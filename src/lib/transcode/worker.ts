import { execFile } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";

import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

import type { DeliveryFormat } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { getStorageAdapterFromEnv } from "@/lib/storage/adapter";

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
      kind: TranscodeQueueMessage["kind"];
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

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message.slice(0, 1_000);
  }

  return "Unknown transcode worker error.";
}

function truncateFailureReason(reason: string) {
  return reason.slice(0, 1_000);
}

function resolveStaleQueuedRecoveryAction(input: {
  previewMode: "CLIP" | "FULL";
  isLossless: boolean;
  queuedAt: Date;
  trackUpdatedAt: Date;
}): StaleQueuedRecoveryAction {
  const trackChangedAfterQueue = input.trackUpdatedAt.getTime() > input.queuedAt.getTime();

  if (input.previewMode === "CLIP" && !input.isLossless) {
    return {
      type: "REQUEUE",
      kind: "PREVIEW_CLIP",
    };
  }

  if (input.previewMode === "FULL" && input.isLossless) {
    if (trackChangedAfterQueue) {
      return {
        type: "FAIL",
        reason:
          "Stale queued transcode job could not be auto-requeued because track settings changed after the job was queued. Queue a new job from the latest track or release actions.",
      };
    }

    return {
      type: "REQUEUE",
      kind: "DELIVERY_FORMATS",
    };
  }

  if (input.previewMode === "CLIP" && input.isLossless) {
    return {
      type: "FAIL",
      reason:
        "Stale queued transcode job could not be auto-requeued because its kind is ambiguous (track preview mode is CLIP and source is lossless). Requeue from track preview settings or the release delivery formats action.",
    };
  }

  return {
    type: "FAIL",
    reason:
      "Stale queued transcode job has no valid transcode path (track preview mode is FULL and source is not lossless). Upload a valid source asset, then queue a new transcode job.",
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

async function runFfmpeg(args: string[]) {
  await execFileAsync("ffmpeg", args, {
    maxBuffer: 10 * 1024 * 1024,
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
  await prisma.transcodeJob.update({
    where: { id: jobId },
    data: {
      status: "FAILED",
      errorMessage,
      finishedAt: new Date(),
    },
  });
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
      status: "QUEUED",
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
      track: {
        select: {
          previewMode: true,
          updatedAt: true,
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
      previewMode: staleJob.track.previewMode,
      isLossless: staleJob.sourceAsset.isLossless,
      queuedAt: staleJob.queuedAt,
      trackUpdatedAt: staleJob.track.updatedAt,
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

  const asset = await prisma.trackAsset.upsert({
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

  await prisma.transcodeOutput.upsert({
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

    await persistOutputRecord({
      jobId: input.jobId,
      trackId: input.trackId,
      storageKey,
      outputFormat: output.outputFormat,
      mimeType: output.mimeType,
      filePath: outputPath,
      isLossless: output.isLosslessOutput,
      assetRole: output.assetRole,
    });
  }
}

export async function processTranscodeQueueMessage(message: TranscodeQueueMessage) {
  const claim = await prisma.transcodeJob.updateMany({
    where: {
      id: message.jobId,
      status: "QUEUED",
    },
    data: {
      status: "RUNNING",
      startedAt: new Date(),
      finishedAt: null,
      errorMessage: null,
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
      trackId: true,
      sourceAssetId: true,
      track: {
        select: {
          id: true,
          previewSeconds: true,
          release: {
            select: {
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

  if (message.kind === "DELIVERY_FORMATS" && !job.sourceAsset.isLossless) {
    await markJobFailed(message.jobId, "Delivery transcode requires a lossless source asset.");
    return;
  }

  const releaseDeliveryFormats =
    job.track.release.deliveryFormats.length > 0
      ? job.track.release.deliveryFormats
      : DEFAULT_RELEASE_DELIVERY_FORMATS;

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

    if (message.kind === "PREVIEW_CLIP") {
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

    await prisma.transcodeJob.update({
      where: { id: job.id },
      data: {
        status: "SUCCEEDED",
        errorMessage: null,
        finishedAt: new Date(),
      },
    });
  } catch (error) {
    await markJobFailed(job.id, toErrorMessage(error));
    throw error;
  } finally {
    await fs.rm(sourcePath, { force: true }).catch(() => undefined);
    await fs.rm(jobOutputRoot, { force: true, recursive: true }).catch(() => undefined);
  }
}
