import { NextResponse } from "next/server";
import { z } from "zod";

import {
  ensureReleaseFilesForCheckout,
  resolveCurrentReleaseSourceAssets,
} from "@/lib/checkout/release-files";
import { prisma } from "@/lib/prisma";
import { enforceCsrfProtection } from "@/lib/security/csrf";
import { requireAdminRequestContext } from "@/lib/admin/request-context";
import { enqueuePreviewClipJob } from "@/lib/transcode/queue";
import {
  adminTrackSelect,
  normalizeTrackDurationMs,
  normalizeTrackNullableText,
  resolveTrackPreviewValues,
  toAdminTrackRecord,
} from "@/lib/admin/track-management";
import { requeueFailedTrackTranscodes } from "@/lib/admin/track-requeue";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ releaseId: string; trackId: string }>;
};

const updateTrackSchema = z
  .object({
    action: z.literal("update"),
    title: z.string().trim().min(1).max(220).optional(),
    artistOverride: z.string().max(220).nullable().optional(),
    trackNumber: z.number().int().positive().optional(),
    durationMs: z.number().int().positive().nullable().optional(),
    lyrics: z.string().max(20_000).nullable().optional(),
    credits: z.string().max(8_000).nullable().optional(),
    previewMode: z.enum(["CLIP", "FULL", "NONE"]).optional(),
    previewSeconds: z.number().int().positive().nullable().optional(),
  })
  .refine(
    (value) =>
      value.title !== undefined ||
      value.artistOverride !== undefined ||
      value.trackNumber !== undefined ||
      value.durationMs !== undefined ||
      value.lyrics !== undefined ||
      value.credits !== undefined ||
      value.previewMode !== undefined ||
      value.previewSeconds !== undefined,
    { message: "Provide at least one track field to update." },
  );

const deleteTrackSchema = z.object({
  action: z.literal("delete"),
});

const requeueFailedTranscodesSchema = z.object({
  action: z.literal("requeue-failed-transcodes"),
});

const actionSchema = z.discriminatedUnion("action", [
  updateTrackSchema,
  deleteTrackSchema,
  requeueFailedTranscodesSchema,
]);

function clampTrackNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}

export async function PATCH(request: Request, context: RouteContext) {
  const csrfError = enforceCsrfProtection(request);
  if (csrfError) {
    return csrfError;
  }

  const auth = await requireAdminRequestContext();
  if (!auth.ok) {
    return auth.response;
  }

  const { releaseId, trackId } = await context.params;
  if (!releaseId || !trackId) {
    return NextResponse.json(
      { ok: false, error: "Release id and track id are required." },
      { status: 400 },
    );
  }

  try {
    const payload = await request.json();
    const parsed = actionSchema.parse(payload);

    const [release, settings] = await Promise.all([
      prisma.release.findFirst({
        where: {
          id: releaseId,
          organizationId: auth.context.organizationId,
        },
        select: { id: true, organizationId: true },
      }),
      prisma.storeSettings.findFirst({
        where: { organizationId: auth.context.organizationId },
        orderBy: { createdAt: "asc" },
        select: {
          defaultPreviewMode: true,
          defaultPreviewSeconds: true,
        },
      }),
    ]);

    if (!release) {
      return NextResponse.json(
        { ok: false, error: "Release not found." },
        { status: 404 },
      );
    }

    const existing = await prisma.releaseTrack.findFirst({
      where: {
        id: trackId,
        releaseId: release.id,
      },
      select: adminTrackSelect,
    });

    if (!existing) {
      return NextResponse.json(
        { ok: false, error: "Track not found for this release." },
        { status: 404 },
      );
    }

    if (parsed.action === "requeue-failed-transcodes") {
      return requeueFailedTrackTranscodes({
        existing,
        release,
        organizationId: auth.context.organizationId,
      });
    }

    if (parsed.action === "delete") {
      await prisma.$transaction(async (tx) => {
        const trackCount = await tx.releaseTrack.count({
          where: { releaseId: release.id },
        });

        await tx.releaseTrack.delete({
          where: { id: existing.id },
        });

        // Shift neighbors in two phases to avoid transient unique collisions on
        // [releaseId, trackNumber].
        const shiftOffset = trackCount + 1;

        await tx.releaseTrack.updateMany({
          where: {
            releaseId: release.id,
            trackNumber: { gt: existing.trackNumber },
          },
          data: {
            trackNumber: { increment: shiftOffset },
          },
        });

        await tx.releaseTrack.updateMany({
          where: {
            releaseId: release.id,
            trackNumber: { gt: existing.trackNumber + shiftOffset },
          },
          data: {
            trackNumber: { decrement: shiftOffset + 1 },
          },
        });

        const sourceAssets = await resolveCurrentReleaseSourceAssets({
          db: tx,
          releaseId: release.id,
          organizationId: release.organizationId,
        });
        const sourceStorageKeys = Array.from(
          new Set(sourceAssets.map((asset) => asset.storageKey)),
        );

        if (sourceStorageKeys.length > 0) {
          await tx.downloadEntitlement.deleteMany({
            where: {
              releaseId: release.id,
              releaseFile: {
                storageKey: {
                  notIn: sourceStorageKeys,
                },
              },
            },
          });

          await tx.releaseFile.deleteMany({
            where: {
              releaseId: release.id,
              storageKey: {
                notIn: sourceStorageKeys,
              },
            },
          });
        } else {
          await tx.downloadEntitlement.deleteMany({
            where: {
              releaseId: release.id,
            },
          });

          await tx.releaseFile.deleteMany({
            where: {
              releaseId: release.id,
            },
          });
        }

        await ensureReleaseFilesForCheckout(tx, {
          releaseId: release.id,
          organizationId: release.organizationId,
        });
      });

      return NextResponse.json({ ok: true, deletedTrackId: existing.id });
    }

    const defaults = {
      previewMode: settings?.defaultPreviewMode ?? "CLIP",
      previewSeconds: settings?.defaultPreviewSeconds ?? 30,
    };

    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.releaseTrack.findFirst({
        where: {
          id: existing.id,
          releaseId: release.id,
        },
        select: {
          id: true,
          title: true,
          artistOverride: true,
          trackNumber: true,
          durationMs: true,
          lyrics: true,
          credits: true,
          previewMode: true,
          previewSeconds: true,
        },
      });

      if (!current) {
        throw new Error("Track not found.");
      }

      const totalTracks = await tx.releaseTrack.count({
        where: { releaseId: release.id },
      });

      const nextTrackNumber = clampTrackNumber(
        parsed.trackNumber ?? current.trackNumber,
        1,
        Math.max(totalTracks, 1),
      );

      const preview = resolveTrackPreviewValues({
        previewMode: parsed.previewMode ?? current.previewMode ?? defaults.previewMode,
        previewSeconds:
          parsed.previewSeconds === undefined
            ? current.previewSeconds
            : parsed.previewSeconds,
        fallbackMode: defaults.previewMode,
        fallbackSeconds: defaults.previewSeconds,
      });
      const previewConfigChanged =
        current.previewMode !== preview.previewMode ||
        (preview.previewMode === "CLIP" &&
          (current.previewSeconds ?? null) !== (preview.previewSeconds ?? null));

      const updateData = {
        title: parsed.title?.trim() ?? current.title,
        artistOverride:
          parsed.artistOverride === undefined
            ? current.artistOverride
            : normalizeTrackNullableText(parsed.artistOverride),
        durationMs:
          parsed.durationMs === undefined
            ? current.durationMs
            : normalizeTrackDurationMs(parsed.durationMs),
        lyrics:
          parsed.lyrics === undefined
            ? current.lyrics
            : normalizeTrackNullableText(parsed.lyrics),
        credits:
          parsed.credits === undefined
            ? current.credits
            : normalizeTrackNullableText(parsed.credits),
        previewMode: preview.previewMode,
        previewSeconds: preview.previewSeconds,
      };

      if (nextTrackNumber !== current.trackNumber) {
        // Move the current track out of the unique index range while we shift neighbors.
        await tx.releaseTrack.update({
          where: { id: current.id },
          data: {
            trackNumber: 0,
          },
        });

        const shiftOffset = totalTracks + 1;

        if (nextTrackNumber < current.trackNumber) {
          // Move neighbors out of range, then normalize to +1.
          await tx.releaseTrack.updateMany({
            where: {
              releaseId: release.id,
              trackNumber: {
                gte: nextTrackNumber,
                lt: current.trackNumber,
              },
            },
            data: {
              trackNumber: { increment: shiftOffset },
            },
          });

          await tx.releaseTrack.updateMany({
            where: {
              releaseId: release.id,
              trackNumber: {
                gte: nextTrackNumber + shiftOffset,
                lt: current.trackNumber + shiftOffset,
              },
            },
            data: {
              trackNumber: { decrement: shiftOffset - 1 },
            },
          });
        } else {
          // Move neighbors out of range, then normalize to -1.
          await tx.releaseTrack.updateMany({
            where: {
              releaseId: release.id,
              trackNumber: {
                gt: current.trackNumber,
                lte: nextTrackNumber,
              },
            },
            data: {
              trackNumber: { increment: shiftOffset },
            },
          });

          await tx.releaseTrack.updateMany({
            where: {
              releaseId: release.id,
              trackNumber: {
                gt: current.trackNumber + shiftOffset,
                lte: nextTrackNumber + shiftOffset,
              },
            },
            data: {
              trackNumber: { decrement: shiftOffset + 1 },
            },
          });
        }
      }

      const track = await tx.releaseTrack.update({
        where: { id: current.id },
        data: {
          ...updateData,
          trackNumber: nextTrackNumber,
        },
        select: adminTrackSelect,
      });

      let previewJobId: string | null = null;

      if (previewConfigChanged && preview.previewMode === "CLIP") {
        const sourceAsset = await tx.trackAsset.findFirst({
          where: {
            trackId: current.id,
            assetRole: "MASTER",
          },
          orderBy: [{ createdAt: "desc" }],
          select: {
            id: true,
          },
        });

        if (sourceAsset) {
          const queuedJob = await tx.transcodeJob.create({
            data: {
              organizationId: auth.context.organizationId,
              trackId: current.id,
              sourceAssetId: sourceAsset.id,
              jobKind: "PREVIEW_CLIP",
              status: "QUEUED",
            },
            select: {
              id: true,
            },
          });

          previewJobId = queuedJob.id;
        }
      }

      return {
        track,
        previewJobId,
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

    return NextResponse.json({
      ok: true,
      track: toAdminTrackRecord(result.track),
      previewJobQueued,
      previewJobId: result.previewJobId,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: "Provide valid track fields for this action." },
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
      { ok: false, error: "Could not update track." },
      { status: 500 },
    );
  }
}
