import { execFile } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { promises as fs } from "node:fs";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";

import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

import { prisma } from "@/lib/prisma";
import { getStorageAdapterFromEnv } from "@/lib/storage/adapter";

import { DEFAULT_FFMPEG_TIMEOUT_SECONDS, readPositiveIntegerSecondsFromEnv } from "./worker-runtime";

const execFileAsync = promisify(execFile);

type AudioMetadata = {
  bitrateKbps: number | null;
  sampleRateHz: number | null;
  channels: number | null;
};

export type DeliveryOutputRollbackCandidate = {
  outputFormat: string;
  storageKey: string;
  outputAssetId: string;
  createdTrackAsset: boolean;
};

export async function runFfmpeg(args: string[]) {
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

export async function readAudioDurationSeconds(filePath: string): Promise<number | null> {
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

export async function writeBodyToFile(body: unknown, targetPath: string) {
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

export async function uploadFileToStorage(input: {
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

export async function removeStalePreviewAssets(input: {
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

export function resolvePreviewStorageKey(input: {
  trackId: string;
  sourceAssetId: string;
  previewSeconds: number;
}) {
  return `generated/previews/${input.trackId}/${input.sourceAssetId}-${input.previewSeconds}s.mp3`;
}

export function resolveDeliveryStorageKey(input: {
  trackId: string;
  sourceAssetId: string;
  extension: string;
}) {
  return `generated/delivery/${input.trackId}/${input.sourceAssetId}.${input.extension}`;
}

export async function persistOutputRecord(input: {
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

export async function cleanupPartialDeliveryOutputs(input: {
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
