import type { Prisma } from "@/generated/prisma/client";
import { NextResponse } from "next/server";

import {
  normalizeNullableText,
  slugify,
  toAdminReleaseRecord,
} from "@/lib/admin/release-management";
import { normalizePricingForRelease } from "@/lib/pricing/pricing-rules";
import { prisma } from "@/lib/prisma";
import {
  extractStorageKeyFromCoverImageUrl,
  isValidCoverStorageKey,
  resolveCoverImageUrlFromStorageKey,
} from "@/lib/storage/cover-art";

import {
  type ReleaseForActionState,
  type RestoreReleaseAction,
  type SoftDeleteReleaseAction,
  type UpdateReleaseAction,
} from "../release-route-types";
import { errorResponse, parseDateInputValue, purgeStorageObjects } from "../release-route-utils";

function resolveReleaseLabel(input: string | null | undefined) {
  const normalized = normalizeNullableText(input);
  return normalized ?? "Independent";
}

export async function handleUpdateReleaseAction<TSelect extends Prisma.ReleaseSelect>(input: {
  parsed: UpdateReleaseAction;
  release: ReleaseForActionState;
  organizationId: string;
  minimumPriceFloorCents: number;
  releaseDateSupported: boolean;
  deliveryFormatsSupported: boolean;
  releaseSelect: TSelect;
}) {
  const {
    parsed,
    release,
    organizationId,
    minimumPriceFloorCents,
    releaseDateSupported,
    deliveryFormatsSupported,
    releaseSelect,
  } = input;

  const artist = await prisma.artist.findFirst({
    where: {
      id: parsed.artistId,
      organizationId,
    },
    select: {
      id: true,
      deletedAt: true,
    },
  });

  if (!artist) {
    return errorResponse("Select an artist for this release.", 400);
  }

  const artistIsAllowed =
    !artist.deletedAt || (artist.deletedAt !== null && artist.id === release.artistId);

  if (!artistIsAllowed) {
    return errorResponse("Cannot move a release to a deleted artist.", 409);
  }

  const normalizedPricing = normalizePricingForRelease({
    currency: release.currency,
    pricingMode: parsed.pricingMode,
    fixedPriceCents: parsed.fixedPriceCents,
    minimumPriceCents: parsed.minimumPriceCents,
    allowFreeCheckout: parsed.allowFreeCheckout ?? false,
    floorCents: minimumPriceFloorCents,
  });

  if (!normalizedPricing.ok) {
    return errorResponse(normalizedPricing.error, 400);
  }

  let releaseDate: Date | null = null;
  if (releaseDateSupported) {
    const currentReleaseDate =
      "releaseDate" in release &&
      release.releaseDate &&
      release.releaseDate instanceof Date
        ? release.releaseDate
        : release.createdAt;
    const resolvedReleaseDateInput =
      parsed.releaseDate && parsed.releaseDate.length > 0
        ? parsed.releaseDate
        : currentReleaseDate.toISOString().slice(0, 10);
    releaseDate = parseDateInputValue(resolvedReleaseDateInput);
    if (!releaseDate) {
      return errorResponse("Provide a valid release date (YYYY-MM-DD).", 400);
    }
  }

  const resolvedSlug = slugify(
    parsed.slug && parsed.slug.length > 0 ? parsed.slug : parsed.title,
    "release",
  );
  const featuredTrackId = normalizeNullableText(parsed.featuredTrackId);

  if (
    featuredTrackId &&
    !release.tracks.some((track) => track.id === featuredTrackId)
  ) {
    return errorResponse("Featured track must belong to this release.", 400);
  }

  const slugConflict = await prisma.release.findFirst({
    where: {
      organizationId,
      slug: resolvedSlug,
      id: { not: release.id },
    },
    select: { id: true },
  });

  if (slugConflict) {
    return errorResponse("That release URL is already in use.", 409);
  }

  const publishedAt = parsed.status === "PUBLISHED" ? release.publishedAt ?? new Date() : null;

  let coverImageUrl = release.coverImageUrl;
  const previousCoverStorageKey = extractStorageKeyFromCoverImageUrl(release.coverImageUrl);
  let coverStorageKeyToDelete: string | null = null;

  if (parsed.removeCoverImage) {
    coverImageUrl = null;
    coverStorageKeyToDelete = previousCoverStorageKey;
  }

  if (typeof parsed.coverStorageKey === "string" && parsed.coverStorageKey.length > 0) {
    if (!isValidCoverStorageKey(parsed.coverStorageKey)) {
      return errorResponse("Invalid cover artwork upload key.", 400);
    }

    coverImageUrl = resolveCoverImageUrlFromStorageKey(parsed.coverStorageKey);
    if (previousCoverStorageKey && previousCoverStorageKey !== parsed.coverStorageKey) {
      coverStorageKeyToDelete = previousCoverStorageKey;
    }
  }

  const updated = await prisma.release.update({
    where: {
      id: release.id,
    },
    // Keep updates compatible with older generated clients that do not include
    // release.deliveryFormats yet.
    data: {
      artistId: artist.id,
      featuredTrackId,
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
        ? {
            deliveryFormats:
              parsed.deliveryFormats ??
              ("deliveryFormats" in release &&
              Array.isArray((release as { deliveryFormats?: unknown }).deliveryFormats)
                ? (release as { deliveryFormats: Array<"MP3" | "M4A" | "FLAC"> })
                    .deliveryFormats
                : ["MP3", "M4A", "FLAC"]),
          }
        : {}),
      priceCents: normalizedPricing.value.priceCents,
      status: parsed.status,
      ...(releaseDateSupported && releaseDate ? { releaseDate } : {}),
      publishedAt,
      isLossyOnly: parsed.markLossyOnly,
    },
    select: releaseSelect,
  });

  if (coverStorageKeyToDelete) {
    await purgeStorageObjects([coverStorageKeyToDelete]).catch(() => undefined);
  }

  return NextResponse.json({
    ok: true,
    release: toAdminReleaseRecord(updated as Parameters<typeof toAdminReleaseRecord>[0]),
  });
}

export async function handleSoftDeleteReleaseAction<TSelect extends Prisma.ReleaseSelect>(input: {
  parsed: SoftDeleteReleaseAction;
  release: ReleaseForActionState;
  releaseSelect: TSelect;
}) {
  const { release, releaseSelect } = input;

  const updated = await prisma.release.update({
    where: {
      id: release.id,
    },
    data: {
      deletedAt: release.deletedAt ? release.deletedAt : new Date(),
    },
    select: releaseSelect,
  });

  return NextResponse.json({
    ok: true,
    release: toAdminReleaseRecord(updated as Parameters<typeof toAdminReleaseRecord>[0]),
  });
}

export async function handleRestoreReleaseAction<TSelect extends Prisma.ReleaseSelect>(input: {
  parsed: RestoreReleaseAction;
  release: ReleaseForActionState;
  releaseSelect: TSelect;
}) {
  const { release, releaseSelect } = input;

  const updated = await prisma.release.update({
    where: {
      id: release.id,
    },
    data: {
      deletedAt: null,
    },
    select: releaseSelect,
  });

  return NextResponse.json({
    ok: true,
    release: toAdminReleaseRecord(updated as Parameters<typeof toAdminReleaseRecord>[0]),
  });
}
