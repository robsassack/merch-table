import { NextResponse } from "next/server";
import { z } from "zod";

import {
  adminReleaseLegacyNoDeliveryFormatsSelect,
  adminReleaseLegacySelect,
  adminReleaseNoDeliveryFormatsSelect,
  adminReleaseSelect,
  normalizeNullableText,
  prismaReleaseSupportsField,
  slugify,
  toAdminReleaseRecord,
} from "@/lib/admin/release-management";
import {
  normalizePricingForRelease,
  readMinimumPriceFloorCentsFromEnv,
  readStripeFeeEstimateConfigFromEnv,
} from "@/lib/pricing/pricing-rules";
import { prisma } from "@/lib/prisma";
import { enforceCsrfProtection } from "@/lib/security/csrf";
import { requireAdminRequestContext } from "@/lib/admin/request-context";
import {
  isValidCoverStorageKey,
  resolveCoverImageUrlFromStorageKey,
} from "@/lib/storage/cover-art";

export const runtime = "nodejs";

const createReleaseSchema = z.object({
  artistId: z.string().trim().min(1),
  title: z.string().trim().min(1).max(160),
  label: z.string().max(160).nullable().optional(),
  releaseType: z
    .enum([
      "ALBUM",
      "EP",
      "SINGLE",
      "COMPILATION",
      "MIXTAPE",
      "LIVE_ALBUM",
      "SOUNDTRACK_SCORE",
      "DEMO",
      "BOOTLEG",
      "REMIX",
      "OTHER",
    ])
    .default("ALBUM"),
  slug: z.string().trim().max(160).optional(),
  description: z.string().max(4_000).nullable().optional(),
  releaseDate: z.string().trim().optional(),
  coverStorageKey: z.string().trim().max(500).nullable().optional(),
  pricingMode: z.enum(["FREE", "FIXED", "PWYW"]),
  fixedPriceCents: z.number().int().nullable().optional(),
  minimumPriceCents: z.number().int().nullable().optional(),
  deliveryFormats: z.array(z.enum(["MP3", "M4A", "FLAC"])).min(1).optional(),
  allowFreeCheckout: z.boolean().optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).default("PUBLISHED"),
  markLossyOnly: z.boolean().default(false),
  confirmLossyOnly: z.boolean().optional(),
});

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

function getTodayDateInputValue() {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateInputValue(dateInput: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    return null;
  }

  const [yearText, monthText, dayText] = dateInput.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }

  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed;
}

function resolveReleaseLabel(input: string | null | undefined) {
  const normalized = normalizeNullableText(input);
  return normalized ?? "Independent";
}

export async function GET() {
  const auth = await requireAdminRequestContext();
  if (!auth.ok) {
    return auth.response;
  }
  const releaseDateSupported = prismaReleaseSupportsField(prisma, "releaseDate");
  const deliveryFormatsSupported = prismaReleaseSupportsField(prisma, "deliveryFormats");
  const releaseSelect = releaseDateSupported
    ? deliveryFormatsSupported
      ? adminReleaseSelect
      : adminReleaseNoDeliveryFormatsSelect
    : deliveryFormatsSupported
      ? adminReleaseLegacySelect
      : adminReleaseLegacyNoDeliveryFormatsSelect;

  const minimumPriceFloorCents = readMinimumPriceFloorCentsFromEnv();
  const stripeFeeEstimate = readStripeFeeEstimateConfigFromEnv();

  const [artists, releases, settings] = await Promise.all([
    prisma.artist.findMany({
      where: { organizationId: auth.context.organizationId },
      orderBy: [{ deletedAt: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        deletedAt: true,
      },
    }),
    prisma.release.findMany({
      where: {
        organizationId: auth.context.organizationId,
      },
      orderBy: [{ createdAt: "desc" }],
      select: releaseSelect,
    }),
    prisma.storeSettings.findFirst({
      where: { organizationId: auth.context.organizationId },
      orderBy: { createdAt: "asc" },
      select: { currency: true, featuredReleaseId: true },
    }),
  ]);

  return NextResponse.json(
    {
      ok: true,
      minimumPriceFloorCents,
      stripeFeeEstimate,
      storeCurrency: settings?.currency ?? "USD",
      featuredReleaseId: settings?.featuredReleaseId ?? null,
      artists: artists.map((artist) => ({
        id: artist.id,
        name: artist.name,
        deletedAt: artist.deletedAt?.toISOString() ?? null,
      })),
      releases: releases.map(toAdminReleaseRecord),
    },
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

  const minimumPriceFloorCents = readMinimumPriceFloorCentsFromEnv();
  const releaseDateSupported = prismaReleaseSupportsField(prisma, "releaseDate");
  const deliveryFormatsSupported = prismaReleaseSupportsField(prisma, "deliveryFormats");
  const releaseSelect = releaseDateSupported
    ? deliveryFormatsSupported
      ? adminReleaseSelect
      : adminReleaseNoDeliveryFormatsSelect
    : deliveryFormatsSupported
      ? adminReleaseLegacySelect
      : adminReleaseLegacyNoDeliveryFormatsSelect;

  try {
    const payload = await request.json();
    const parsed = createReleaseSchema.parse(payload);
    let releaseDate: Date | null = null;
    if (releaseDateSupported) {
      const resolvedReleaseDateInput =
        parsed.releaseDate && parsed.releaseDate.length > 0
          ? parsed.releaseDate
          : getTodayDateInputValue();
      releaseDate = parseDateInputValue(resolvedReleaseDateInput);
      if (!releaseDate) {
        return NextResponse.json(
          {
            ok: false,
            error: "Provide a valid release date (YYYY-MM-DD).",
          },
          { status: 400 },
        );
      }
    }

    const activeArtist = await prisma.artist.findFirst({
      where: {
        id: parsed.artistId,
        organizationId: auth.context.organizationId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!activeArtist) {
      return NextResponse.json(
        {
          ok: false,
          error: "Select an active artist for this release.",
        },
        { status: 400 },
      );
    }

    const normalizedPricing = normalizePricingForRelease({
      pricingMode: parsed.pricingMode,
      fixedPriceCents: parsed.fixedPriceCents,
      minimumPriceCents: parsed.minimumPriceCents,
      allowFreeCheckout: parsed.allowFreeCheckout ?? false,
      floorCents: minimumPriceFloorCents,
    });

    if (!normalizedPricing.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: normalizedPricing.error,
        },
        { status: 400 },
      );
    }

    let coverImageUrl: string | null = null;
    if (typeof parsed.coverStorageKey === "string" && parsed.coverStorageKey.length > 0) {
      if (!isValidCoverStorageKey(parsed.coverStorageKey)) {
        return NextResponse.json(
          {
            ok: false,
            error: "Invalid cover artwork upload key.",
          },
          { status: 400 },
        );
      }

      coverImageUrl = resolveCoverImageUrlFromStorageKey(parsed.coverStorageKey);
    }

    const resolvedSlug = slugify(
      parsed.slug && parsed.slug.length > 0 ? parsed.slug : parsed.title,
      "release",
    );

    const slugConflict = await prisma.release.findFirst({
      where: {
        organizationId: auth.context.organizationId,
        slug: resolvedSlug,
      },
      select: { id: true },
    });

    if (slugConflict) {
      return NextResponse.json(
        { ok: false, error: "That release URL is already in use." },
        { status: 409 },
      );
    }

    const settings = await prisma.storeSettings.findFirst({
      where: { organizationId: auth.context.organizationId },
      orderBy: { createdAt: "asc" },
      select: { currency: true },
    });

    const created = await prisma.release.create({
      data: {
        organizationId: auth.context.organizationId,
        artistId: activeArtist.id,
        title: parsed.title.trim(),
        label: resolveReleaseLabel(parsed.label),
        releaseType: parsed.releaseType,
        slug: resolvedSlug,
        description: normalizeNullableText(parsed.description),
        coverImageUrl,
        pricingMode: parsed.pricingMode,
        fixedPriceCents: normalizedPricing.value.fixedPriceCents,
        minimumPriceCents: normalizedPricing.value.minimumPriceCents,
        ...(deliveryFormatsSupported
          ? { deliveryFormats: parsed.deliveryFormats ?? ["MP3", "M4A", "FLAC"] }
          : {}),
        priceCents: normalizedPricing.value.priceCents,
        currency: settings?.currency ?? "USD",
        status: parsed.status,
        ...(releaseDateSupported && releaseDate ? { releaseDate } : {}),
        publishedAt: parsed.status === "PUBLISHED" ? new Date() : null,
        isLossyOnly: parsed.markLossyOnly,
      },
      select: releaseSelect,
    });

    return NextResponse.json(
      {
        ok: true,
        release: toAdminReleaseRecord(created),
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: "Provide valid release fields before saving." },
        { status: 400 },
      );
    }

    if (isUniqueConstraintError(error)) {
      return NextResponse.json(
        { ok: false, error: "That release URL is already in use." },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { ok: false, error: "Could not create release." },
      { status: 500 },
    );
  }
}
