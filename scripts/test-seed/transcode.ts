import { TranscodeJobKind, TranscodeStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

import {
  assetIdFor,
  FIXTURE_NOW,
  IDS,
  releasePath,
  trackIdFor,
} from "./fixtures";

export async function seedTranscodeFixtures() {
  await prisma.transcodeJob.create({
    data: {
      id: "transcode_job_test_succeeded",
      organizationId: IDS.organization,
      trackId: trackIdFor("fixed"),
      sourceAssetId: assetIdFor("fixed", "master", "flac"),
      jobKind: TranscodeJobKind.DELIVERY_FORMATS,
      attemptCount: 1,
      status: TranscodeStatus.SUCCEEDED,
      queuedAt: new Date("2026-01-10T14:00:00.000Z"),
      startedAt: new Date("2026-01-10T14:00:05.000Z"),
      finishedAt: new Date("2026-01-10T14:01:00.000Z"),
      createdAt: FIXTURE_NOW,
      updatedAt: FIXTURE_NOW,
      outputs: {
        create: {
          id: "transcode_output_test_fixed_mp3",
          outputAssetId: assetIdFor("fixed", "delivery", "mp3"),
          format: "mp3",
          storageKey: releasePath("fixed-release", "track-01/delivery.mp3"),
          mimeType: "audio/mpeg",
          fileSizeBytes: 6_100_000,
          createdAt: FIXTURE_NOW,
          updatedAt: FIXTURE_NOW,
        },
      },
    },
  });

  await prisma.transcodeJob.create({
    data: {
      id: "transcode_job_test_failed",
      organizationId: IDS.organization,
      trackId: trackIdFor("pwyw"),
      sourceAssetId: assetIdFor("pwyw", "master", "flac"),
      jobKind: TranscodeJobKind.PREVIEW_CLIP,
      attemptCount: 3,
      status: TranscodeStatus.FAILED,
      errorMessage: "Deterministic failed transcode fixture.",
      queuedAt: new Date("2026-01-11T14:00:00.000Z"),
      startedAt: new Date("2026-01-11T14:00:05.000Z"),
      finishedAt: new Date("2026-01-11T14:02:00.000Z"),
      createdAt: FIXTURE_NOW,
      updatedAt: FIXTURE_NOW,
    },
  });
}
