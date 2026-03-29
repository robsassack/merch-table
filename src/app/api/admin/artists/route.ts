import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { enforceCsrfProtection } from "@/lib/security/csrf";
import { requireAdminRequestContext } from "@/lib/admin/request-context";

export const runtime = "nodejs";

const createArtistSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().max(120).optional(),
  location: z.string().max(160).nullable().optional(),
  bio: z.string().max(4_000).nullable().optional(),
});

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

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

export async function GET() {
  const auth = await requireAdminRequestContext();
  if (!auth.ok) {
    return auth.response;
  }

  const artists = await prisma.artist.findMany({
    where: { organizationId: auth.context.organizationId },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      slug: true,
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

  return NextResponse.json(
    { ok: true, artists },
    {
      headers: {
        "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    },
  );
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
    const parsed = createArtistSchema.parse(payload);
    const resolvedSlug = slugify(parsed.slug && parsed.slug.length > 0 ? parsed.slug : parsed.name);

    const existing = await prisma.artist.findFirst({
      where: {
        organizationId: auth.context.organizationId,
        slug: resolvedSlug,
      },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json(
        { ok: false, error: "That artist slug is already in use." },
        { status: 409 },
      );
    }

    const artist = await prisma.artist.create({
      data: {
        organizationId: auth.context.organizationId,
        ownerId: auth.context.session.userId,
        name: parsed.name.trim(),
        slug: resolvedSlug,
        location: normalizeLocation(parsed.location),
        bio: normalizeBio(parsed.bio),
      },
      select: {
        id: true,
        name: true,
        slug: true,
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

    return NextResponse.json({ ok: true, artist }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: "Provide a valid artist name, URL, location, and bio." },
        { status: 400 },
      );
    }

    if (isUniqueConstraintError(error)) {
      return NextResponse.json(
        { ok: false, error: "That artist slug is already in use." },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { ok: false, error: "Could not create artist." },
      { status: 500 },
    );
  }
}
