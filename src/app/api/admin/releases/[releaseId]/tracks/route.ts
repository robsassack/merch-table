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
  params: Promise<{ releaseId: string }>;
};

const createTrackSchema = z.object({
  title: z.string().trim().min(1).max(220),
  trackNumber: z.number().int().positive().optional(),
  durationMs: z.number().int().positive().nullable().optional(),
  lyrics: z.string().max(20_000).nullable().optional(),
  credits: z.string().max(8_000).nullable().optional(),
  previewMode: z.enum(["CLIP", "FULL"]).optional(),
  previewSeconds: z.number().int().positive().nullable().optional(),
});

function clampTrackNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireAdminRequestContext();
  if (!auth.ok) {
    return auth.response;
  }

  const { releaseId } = await context.params;
  if (!releaseId) {
    return NextResponse.json(
      { ok: false, error: "Release id is required." },
      { status: 400 },
    );
  }

  const release = await prisma.release.findFirst({
    where: {
      id: releaseId,
      organizationId: auth.context.organizationId,
    },
    select: { id: true },
  });

  if (!release) {
    return NextResponse.json(
      { ok: false, error: "Release not found." },
      { status: 404 },
    );
  }

  const tracks = await prisma.releaseTrack.findMany({
    where: {
      releaseId: release.id,
    },
    orderBy: [{ trackNumber: "asc" }, { createdAt: "asc" }],
    select: adminTrackSelect,
  });

  return NextResponse.json({
    ok: true,
    tracks: tracks.map(toAdminTrackRecord),
  });
}

export async function POST(request: Request, context: RouteContext) {
  const csrfError = enforceCsrfProtection(request);
  if (csrfError) {
    return csrfError;
  }

  const auth = await requireAdminRequestContext();
  if (!auth.ok) {
    return auth.response;
  }

  const { releaseId } = await context.params;
  if (!releaseId) {
    return NextResponse.json(
      { ok: false, error: "Release id is required." },
      { status: 400 },
    );
  }

  try {
    const payload = await request.json();
    const parsed = createTrackSchema.parse(payload);

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

    const defaults = {
      previewMode: settings?.defaultPreviewMode ?? "CLIP",
      previewSeconds: settings?.defaultPreviewSeconds ?? 30,
    };

    const created = await prisma.$transaction(async (tx) => {
      const existingCount = await tx.releaseTrack.count({
        where: { releaseId: release.id },
      });
      const requestedTrackNumber =
        parsed.trackNumber ?? existingCount + 1;
      const trackNumber = clampTrackNumber(
        requestedTrackNumber,
        1,
        existingCount + 1,
      );

      if (trackNumber <= existingCount) {
        await tx.releaseTrack.updateMany({
          where: {
            releaseId: release.id,
            trackNumber: { gte: trackNumber },
          },
          data: {
            trackNumber: { increment: 1 },
          },
        });
      }

      const preview = resolveTrackPreviewValues({
        previewMode: parsed.previewMode,
        previewSeconds: parsed.previewSeconds,
        fallbackMode: defaults.previewMode,
        fallbackSeconds: defaults.previewSeconds,
      });

      const track = await tx.releaseTrack.create({
        data: {
          releaseId: release.id,
          title: parsed.title.trim(),
          trackNumber,
          durationMs: normalizeTrackDurationMs(parsed.durationMs),
          lyrics: normalizeTrackNullableText(parsed.lyrics),
          credits: normalizeTrackNullableText(parsed.credits),
          previewMode: preview.previewMode,
          previewSeconds: preview.previewSeconds,
        },
        select: adminTrackSelect,
      });

      return track;
    });

    return NextResponse.json(
      {
        ok: true,
        track: toAdminTrackRecord(created),
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: "Provide valid track fields before saving." },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { ok: false, error: "Could not create track." },
      { status: 500 },
    );
  }
}
