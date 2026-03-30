import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { enforceCsrfProtection } from "@/lib/security/csrf";
import { requireAdminRequestContext } from "@/lib/admin/request-context";
import {
  adminTrackSelect,
  normalizeTrackDurationMs,
  normalizeTrackNullableText,
  resolveTrackPreviewValues,
  toAdminTrackRecord,
} from "@/lib/admin/track-management";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ releaseId: string; trackId: string }>;
};

const updateTrackSchema = z
  .object({
    action: z.literal("update"),
    title: z.string().trim().min(1).max(220).optional(),
    trackNumber: z.number().int().positive().optional(),
    durationMs: z.number().int().positive().nullable().optional(),
    lyrics: z.string().max(20_000).nullable().optional(),
    credits: z.string().max(8_000).nullable().optional(),
    previewMode: z.enum(["CLIP", "FULL"]).optional(),
    previewSeconds: z.number().int().positive().nullable().optional(),
  })
  .refine(
    (value) =>
      value.title !== undefined ||
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

const actionSchema = z.discriminatedUnion("action", [
  updateTrackSchema,
  deleteTrackSchema,
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
        select: { id: true },
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

    if (parsed.action === "delete") {
      await prisma.$transaction(async (tx) => {
        await tx.releaseTrack.delete({
          where: { id: existing.id },
        });

        await tx.releaseTrack.updateMany({
          where: {
            releaseId: release.id,
            trackNumber: { gt: existing.trackNumber },
          },
          data: {
            trackNumber: { decrement: 1 },
          },
        });
      });

      return NextResponse.json({ ok: true, deletedTrackId: existing.id });
    }

    const defaults = {
      previewMode: settings?.defaultPreviewMode ?? "CLIP",
      previewSeconds: settings?.defaultPreviewSeconds ?? 30,
    };

    const updated = await prisma.$transaction(async (tx) => {
      const current = await tx.releaseTrack.findFirst({
        where: {
          id: existing.id,
          releaseId: release.id,
        },
        select: {
          id: true,
          title: true,
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

      const updateData = {
        title: parsed.title?.trim() ?? current.title,
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

        if (nextTrackNumber < current.trackNumber) {
          await tx.releaseTrack.updateMany({
            where: {
              releaseId: release.id,
              trackNumber: {
                gte: nextTrackNumber,
                lt: current.trackNumber,
              },
            },
            data: {
              trackNumber: { increment: 1 },
            },
          });
        } else {
          await tx.releaseTrack.updateMany({
            where: {
              releaseId: release.id,
              trackNumber: {
                gt: current.trackNumber,
                lte: nextTrackNumber,
              },
            },
            data: {
              trackNumber: { decrement: 1 },
            },
          });
        }
      }

      return tx.releaseTrack.update({
        where: { id: current.id },
        data: {
          ...updateData,
          trackNumber: nextTrackNumber,
        },
        select: adminTrackSelect,
      });
    });

    return NextResponse.json({
      ok: true,
      track: toAdminTrackRecord(updated),
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
