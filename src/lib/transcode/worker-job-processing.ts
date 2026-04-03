import path from "node:path";

import type { DeliveryFormat } from "@/generated/prisma/enums";

import {
  cleanupPartialDeliveryOutputs,
  persistOutputRecord,
  readAudioDurationSeconds,
  removeStalePreviewAssets,
  resolveDeliveryStorageKey,
  resolvePreviewStorageKey,
  runFfmpeg,
  uploadFileToStorage,
} from "./worker-media-io";

type OutputDefinition = {
  releaseFormat: DeliveryFormat;
  outputFormat: string;
  extension: string;
  mimeType: string;
  isLosslessOutput: boolean;
  assetRole: "PREVIEW" | "DELIVERY";
  ffmpegArgs: (inputPath: string, outputPath: string) => string[];
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

export async function processPreviewJob(input: {
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

export async function processDeliveryFormatsJob(input: {
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

  const processedOutputs: Array<{
    outputFormat: string;
    storageKey: string;
    outputAssetId: string;
    createdTrackAsset: boolean;
  }> = [];

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
