import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { enforceCsrfProtection } from "@/lib/security/csrf";
import { requireAdminRequestContext } from "@/lib/admin/request-context";
import {
  isValidCoverStorageKey,
  resolveCoverImageUrlFromStorageKey,
} from "@/lib/storage/cover-art";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ artistId: string }>;
};

const updateArtistSchema = z.object({
  action: z.literal("update"),
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().max(120).optional(),
  imageStorageKey: z.string().trim().min(1).max(500).nullable().optional(),
  location: z.string().max(160).nullable().optional(),
  bio: z.string().max(4_000).nullable().optional(),
});

const softDeleteSchema = z.object({
  action: z.literal("soft-delete"),
});

const restoreSchema = z.object({
  action: z.literal("restore"),
});

const purgeSchema = z.object({
  action: z.literal("purge"),
  confirmName: z.string(),
});

const actionSchema = z.discriminatedUnion("action", [
  updateArtistSchema,
  softDeleteSchema,
  restoreSchema,
  purgeSchema,
]);

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug.length > 0 ? slug : "artist";
}

function normalizeBio(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeLocation(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveArtistImageUpdate(
  value: string | null | undefined,
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (!isValidCoverStorageKey(value)) {
    throw new Error("Invalid artist image upload key.");
  }

  return resolveCoverImageUrlFromStorageKey(value);
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
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

  const { artistId } = await context.params;
  if (!artistId) {
    return NextResponse.json(
      { ok: false, error: "Artist id is required." },
      { status: 400 },
    );
  }

  try {
    const payload = await request.json();
    const parsed = actionSchema.parse(payload);

    const artist = await prisma.artist.findFirst({
      where: {
        id: artistId,
        organizationId: auth.context.organizationId,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        imageUrl: true,
        location: true,
        bio: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { releases: true },
        },
      },
    });

    if (!artist) {
      return NextResponse.json(
        { ok: false, error: "Artist not found." },
        { status: 404 },
      );
    }

    if (parsed.action === "update") {
      const resolvedSlug = slugify(
        parsed.slug && parsed.slug.length > 0 ? parsed.slug : parsed.name,
      );

      const slugConflict = await prisma.artist.findFirst({
        where: {
          organizationId: auth.context.organizationId,
          slug: resolvedSlug,
          id: { not: artist.id },
        },
        select: { id: true },
      });

      if (slugConflict) {
        return NextResponse.json(
          { ok: false, error: "That artist slug is already in use." },
          { status: 409 },
        );
      }

      const updated = await prisma.artist.update({
        where: { id: artist.id },
        data: {
          name: parsed.name.trim(),
          slug: resolvedSlug,
          ...(parsed.imageStorageKey !== undefined
            ? { imageUrl: resolveArtistImageUpdate(parsed.imageStorageKey) }
            : {}),
          location: normalizeLocation(parsed.location),
          bio: normalizeBio(parsed.bio),
        },
        select: {
          id: true,
          name: true,
          slug: true,
          imageUrl: true,
          location: true,
          bio: true,
          deletedAt: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: { releases: true },
          },
        },
      });

      return NextResponse.json({ ok: true, artist: updated });
    }

    if (parsed.action === "soft-delete") {
      const updated = await prisma.artist.update({
        where: { id: artist.id },
        data: {
          deletedAt: artist.deletedAt ? artist.deletedAt : new Date(),
        },
        select: {
          id: true,
          name: true,
          slug: true,
          imageUrl: true,
          location: true,
          bio: true,
          deletedAt: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: { releases: true },
          },
        },
      });

      return NextResponse.json({ ok: true, artist: updated });
    }

    if (parsed.action === "restore") {
      const updated = await prisma.artist.update({
        where: { id: artist.id },
        data: { deletedAt: null },
        select: {
          id: true,
          name: true,
          slug: true,
          imageUrl: true,
          location: true,
          bio: true,
          deletedAt: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: { releases: true },
          },
        },
      });

      return NextResponse.json({ ok: true, artist: updated });
    }

    if (parsed.confirmName.trim() !== artist.name) {
      return NextResponse.json(
        {
          ok: false,
          error: "Enter the artist name exactly to confirm permanent removal.",
        },
        { status: 400 },
      );
    }

    if (!artist.deletedAt) {
      return NextResponse.json(
        {
          ok: false,
          error: "Soft-delete the artist before permanently purging it.",
        },
        { status: 409 },
      );
    }

    if (artist._count.releases > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "Cannot purge an artist that still has releases.",
        },
        { status: 409 },
      );
    }

    await prisma.artist.delete({ where: { id: artist.id } });

    return NextResponse.json({ ok: true, purgedArtistId: artist.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: "Invalid artist action request." },
        { status: 400 },
      );
    }

    if (isUniqueConstraintError(error)) {
      return NextResponse.json(
        { ok: false, error: "That artist slug is already in use." },
        { status: 409 },
      );
    }

    if (error instanceof Error && error.message === "Invalid artist image upload key.") {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { ok: false, error: "Could not update artist." },
      { status: 500 },
    );
  }
}
