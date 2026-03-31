import path from "node:path";

import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { prismaModelSupportsField } from "@/lib/prisma/runtime-support";
import { enforceCsrfProtection } from "@/lib/security/csrf";
import { requireAdminRequestContext } from "@/lib/admin/request-context";
import { createTranscodeJobWithActiveDedupe } from "@/lib/transcode/job-dedupe";
import { enqueueDeliveryFormatsJob, enqueuePreviewClipJob } from "@/lib/transcode/queue";
import {
  isAllowedUploadContentType,
  normalizeContentType,
} from "@/lib/storage/upload-policy";

export const runtime = "nodejs";

const commitTrackAssetSchema = z.object({
  releaseId: z.string().trim().min(1),
  trackId: z.string().trim().min(1),
  fileName: z.string().trim().min(1).max(255),
  storageKey: z.string().trim().min(1).max(500),
  contentType: z.string().trim().min(1).max(255),
  sizeBytes: z.number().int().positive(),
  assetRole: z.enum(["MASTER", "DELIVERY"]),
  format: z.string().trim().min(1).max(40).optional(),
  bitrateKbps: z.number().int().positive().nullable().optional(),
  sampleRateHz: z.number().int().positive().nullable().optional(),
  channels: z.number().int().positive().nullable().optional(),
  isLossless: z.boolean().optional(),
});

const MIME_TO_FORMAT: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/flac": "flac",
  "audio/x-flac": "flac",
  "audio/aac": "aac",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
  "audio/aiff": "aiff",
  "audio/x-aiff": "aiff",
};

const LOSSLESS_FORMATS = new Set(["flac", "wav", "aiff", "aif", "alac"]);

function isValidUploadedAudioStorageKey(storageKey: string) {
  if (storageKey.includes("..")) {
    return false;
  }

  return storageKey.startsWith("admin/uploads/");
}

function inferFormatFromFileName(fileName: string) {
  const extension = path.extname(fileName).toLowerCase().replace(".", "");
  if (!extension) {
    return null;
  }

  return extension;
}

function resolveTrackAssetFormat(input: {
  explicitFormat: string | undefined;
  fileName: string;
  mimeType: string;
}) {
  if (input.explicitFormat && input.explicitFormat.length > 0) {
    return input.explicitFormat.toLowerCase();
  }

  const fromName = inferFormatFromFileName(input.fileName);
  if (fromName) {
    return fromName;
  }

  return MIME_TO_FORMAT[input.mimeType] ?? "bin";
}

function inferLosslessStatus(input: {
  explicit: boolean | undefined;
  format: string;
  mimeType: string;
}) {
  if (typeof input.explicit === "boolean") {
    return input.explicit;
  }

  if (LOSSLESS_FORMATS.has(input.format)) {
    return true;
  }

  return (
    input.mimeType.includes("flac") ||
    input.mimeType.includes("wav") ||
    input.mimeType.includes("aiff")
  );
}

function normalizeOptionalPositiveInt(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  return Math.round(value);
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

  try {
    const payload = await request.json();
    const parsed = commitTrackAssetSchema.parse(payload);
    const mimeType = normalizeContentType(parsed.contentType);
    if (!isAllowedUploadContentType(mimeType)) {
      return NextResponse.json(
        {
          ok: false,
          error: `Unsupported audio content type "${parsed.contentType}".`,
        },
        { status: 415 },
      );
    }

    if (!isValidUploadedAudioStorageKey(parsed.storageKey)) {
      return NextResponse.json(
        { ok: false, error: "Invalid storage key for uploaded track asset." },
        { status: 400 },
      );
    }

    const track = await prisma.releaseTrack.findFirst({
      where: {
        id: parsed.trackId,
        releaseId: parsed.releaseId,
        release: {
          organizationId: auth.context.organizationId,
        },
      },
      select: {
        id: true,
        releaseId: true,
        previewMode: true,
      },
    });

    if (!track) {
      return NextResponse.json(
        { ok: false, error: "Track not found for this release." },
        { status: 404 },
      );
    }

    const format = resolveTrackAssetFormat({
      explicitFormat: parsed.format,
      fileName: parsed.fileName,
      mimeType,
    });
    const isLossless = inferLosslessStatus({
      explicit: parsed.isLossless,
      format,
      mimeType,
    });

    const result = await prisma.$transaction(async (tx) => {
      const transcodeJobKindSupported = prismaModelSupportsField(
        tx,
        "TranscodeJob",
        "kind",
      );

      const existing = await tx.trackAsset.findFirst({
        where: {
          trackId: track.id,
          storageKey: parsed.storageKey,
        },
        select: {
          id: true,
          trackId: true,
          storageKey: true,
          format: true,
          mimeType: true,
          fileSizeBytes: true,
          bitrateKbps: true,
          sampleRateHz: true,
          channels: true,
          isLossless: true,
          assetRole: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      const asset = existing
        ? await tx.trackAsset.update({
            where: { id: existing.id },
            data: {
              format,
              mimeType,
              fileSizeBytes: parsed.sizeBytes,
              bitrateKbps: normalizeOptionalPositiveInt(parsed.bitrateKbps),
              sampleRateHz: normalizeOptionalPositiveInt(parsed.sampleRateHz),
              channels: normalizeOptionalPositiveInt(parsed.channels),
              isLossless,
              assetRole: parsed.assetRole,
            },
            select: {
              id: true,
              trackId: true,
              storageKey: true,
              format: true,
              mimeType: true,
              fileSizeBytes: true,
              bitrateKbps: true,
              sampleRateHz: true,
              channels: true,
              isLossless: true,
              assetRole: true,
              createdAt: true,
              updatedAt: true,
            },
          })
        : await tx.trackAsset.create({
            data: {
              trackId: track.id,
              storageKey: parsed.storageKey,
              format,
              mimeType,
              fileSizeBytes: parsed.sizeBytes,
              bitrateKbps: normalizeOptionalPositiveInt(parsed.bitrateKbps),
              sampleRateHz: normalizeOptionalPositiveInt(parsed.sampleRateHz),
              channels: normalizeOptionalPositiveInt(parsed.channels),
              isLossless,
              assetRole: parsed.assetRole,
            },
            select: {
              id: true,
              trackId: true,
              storageKey: true,
              format: true,
              mimeType: true,
              fileSizeBytes: true,
              bitrateKbps: true,
              sampleRateHz: true,
              channels: true,
              isLossless: true,
              assetRole: true,
              createdAt: true,
              updatedAt: true,
            },
          });

      let previewJobId: string | null = null;
      let deliveryJobId: string | null = null;
      let forcedLossyOnly = false;
      let forcedLosslessOnly = false;
      let removedDeliveryAssetCount = 0;

      if (asset.assetRole === "MASTER" && !asset.isLossless) {
        const releaseUpdate = await tx.release.updateMany({
          where: {
            id: track.releaseId,
            organizationId: auth.context.organizationId,
            isLossyOnly: false,
          },
          data: {
            isLossyOnly: true,
          },
        });
        forcedLossyOnly = releaseUpdate.count > 0;

        const deliveryAssetsToRemove = await tx.trackAsset.findMany({
          where: {
            trackId: track.id,
            assetRole: "DELIVERY",
          },
          select: {
            id: true,
          },
        });

        if (deliveryAssetsToRemove.length > 0) {
          await tx.trackAsset.deleteMany({
            where: {
              id: {
                in: deliveryAssetsToRemove.map((entry) => entry.id),
              },
            },
          });
          removedDeliveryAssetCount = deliveryAssetsToRemove.length;
        }
      }

      if (asset.assetRole === "MASTER" && asset.isLossless) {
        const releaseMasterAssets = await tx.trackAsset.findMany({
          where: {
            assetRole: "MASTER",
            track: {
              releaseId: track.releaseId,
            },
          },
          select: {
            isLossless: true,
          },
        });

        const allMastersLossless =
          releaseMasterAssets.length > 0 &&
          releaseMasterAssets.every((entry) => entry.isLossless);

        if (allMastersLossless) {
          const releaseUpdate = await tx.release.updateMany({
            where: {
              id: track.releaseId,
              organizationId: auth.context.organizationId,
              isLossyOnly: true,
            },
            data: {
              isLossyOnly: false,
            },
          });
          forcedLosslessOnly = releaseUpdate.count > 0;
        }
      }

      if (asset.assetRole === "MASTER" && track.previewMode === "CLIP") {
        const previewJobData: Record<string, unknown> = {
          organizationId: auth.context.organizationId,
          trackId: track.id,
          sourceAssetId: asset.id,
          status: "QUEUED",
        };
        if (transcodeJobKindSupported) {
          previewJobData.kind = "PREVIEW_CLIP";
        }

        const queuedJob = await tx.transcodeJob.create({
          data: previewJobData as never,
          select: {
            id: true,
          },
        });

        previewJobId = queuedJob.id;
      }

      if (asset.assetRole === "MASTER" && asset.isLossless) {
        if (!transcodeJobKindSupported) {
          const queuedDeliveryJob = await tx.transcodeJob.create({
            data: {
              organizationId: auth.context.organizationId,
              trackId: track.id,
              sourceAssetId: asset.id,
              status: "QUEUED",
            } as never,
            select: {
              id: true,
            },
          });
          deliveryJobId = queuedDeliveryJob.id;
        } else {
        const queuedDeliveryJob = await createTranscodeJobWithActiveDedupe(tx, {
          organizationId: auth.context.organizationId,
          trackId: track.id,
          sourceAssetId: asset.id,
          kind: "DELIVERY_FORMATS",
          kindSupported: transcodeJobKindSupported,
        });

        if (queuedDeliveryJob.created) {
          deliveryJobId = queuedDeliveryJob.jobId;
        }
        }
      }

      return {
        asset,
        previewJobId,
        deliveryJobId,
        forcedLossyOnly,
        forcedLosslessOnly,
        removedDeliveryAssetCount,
      };
    });

    let previewJobQueued = false;
    if (result.previewJobId) {
      try {
        await enqueuePreviewClipJob(result.previewJobId);
        previewJobQueued = true;
      } catch {
        await prisma.transcodeJob
          .update({
            where: { id: result.previewJobId },
            data: {
              status: "FAILED",
              errorMessage: "Could not enqueue preview transcode job.",
              finishedAt: new Date(),
            },
          })
          .catch(() => undefined);
      }
    }

    let deliveryJobQueued = false;
    if (result.deliveryJobId) {
      try {
        await enqueueDeliveryFormatsJob(result.deliveryJobId);
        deliveryJobQueued = true;
      } catch {
        await prisma.transcodeJob
          .update({
            where: { id: result.deliveryJobId },
            data: {
              status: "FAILED",
              errorMessage: "Could not enqueue delivery transcode job.",
              finishedAt: new Date(),
            },
          })
          .catch(() => undefined);
      }
    }

    return NextResponse.json({
      ok: true,
      asset: {
        ...result.asset,
        createdAt: result.asset.createdAt.toISOString(),
        updatedAt: result.asset.updatedAt.toISOString(),
      },
      previewJobQueued,
      previewJobId: result.previewJobId,
      deliveryJobQueued,
      deliveryJobId: result.deliveryJobId,
      forcedLossyOnly: result.forcedLossyOnly,
      forcedLosslessOnly: result.forcedLosslessOnly,
      removedDeliveryAssetCount: result.removedDeliveryAssetCount,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: "Provide valid release, track, and asset metadata." },
        { status: 400 },
      );
    }

    if (error instanceof Error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { ok: false, error: "Could not commit track asset." },
      { status: 500 },
    );
  }
}
