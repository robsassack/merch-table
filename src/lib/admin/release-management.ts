import type { Prisma } from "@/generated/prisma/client";

const adminReleaseSelectShared = {
  id: true,
  artistId: true,
  title: true,
  slug: true,
  description: true,
  coverImageUrl: true,
  pricingMode: true,
  fixedPriceCents: true,
  minimumPriceCents: true,
  priceCents: true,
  currency: true,
  status: true,
  publishedAt: true,
  deletedAt: true,
  isLossyOnly: true,
  createdAt: true,
  updatedAt: true,
  artist: {
    select: {
      id: true,
      name: true,
      deletedAt: true,
    },
  },
  tracks: {
    select: {
      id: true,
      assets: {
        select: {
          id: true,
          isLossless: true,
        },
      },
    },
  },
  _count: {
    select: {
      tracks: true,
      files: true,
      orderItems: true,
    },
  },
} satisfies Prisma.ReleaseSelect;

export const adminReleaseSelect = {
  ...adminReleaseSelectShared,
  releaseDate: true,
} satisfies Prisma.ReleaseSelect;

export const adminReleaseLegacySelect = {
  ...adminReleaseSelectShared,
} satisfies Prisma.ReleaseSelect;

export type AdminReleaseRow = Prisma.ReleaseGetPayload<{
  select: typeof adminReleaseSelect;
}>;

export type AdminReleaseLegacyRow = Prisma.ReleaseGetPayload<{
  select: typeof adminReleaseLegacySelect;
}>;

export type AdminReleaseAnyRow = AdminReleaseRow | AdminReleaseLegacyRow;

export type AdminReleaseRecord = {
  id: string;
  artistId: string;
  title: string;
  slug: string;
  description: string | null;
  coverImageUrl: string | null;
  pricingMode: "FREE" | "FIXED" | "PWYW";
  fixedPriceCents: number | null;
  minimumPriceCents: number | null;
  priceCents: number;
  currency: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  releaseDate: string;
  publishedAt: string | null;
  deletedAt: string | null;
  isLossyOnly: boolean;
  qualityDisclosureRequired: boolean;
  hasLosslessMasters: boolean;
  trackAssetCount: number;
  createdAt: string;
  updatedAt: string;
  artist: {
    id: string;
    name: string;
    deletedAt: string | null;
  };
  _count: {
    tracks: number;
    files: number;
    orderItems: number;
  };
};

type RuntimeModelField = { name?: string };
type RuntimeModel = { fields?: RuntimeModelField[] };
type RuntimeModelData = { models?: Record<string, RuntimeModel> };
type RuntimeAwareClient = { _runtimeDataModel?: RuntimeModelData };

export function prismaReleaseSupportsField(client: unknown, fieldName: string) {
  const runtimeDataModel = (client as RuntimeAwareClient | null)?._runtimeDataModel;
  const releaseModel = runtimeDataModel?.models?.Release;
  const fields = releaseModel?.fields;

  if (!Array.isArray(fields)) {
    return true;
  }

  return fields.some((field) => field?.name === fieldName);
}

export function slugify(value: string, fallback: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug.length > 0 ? slug : fallback;
}

export function normalizeNullableText(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function toAdminReleaseRecord(release: AdminReleaseAnyRow): AdminReleaseRecord {
  const hasLosslessMasters = release.tracks.some((track) =>
    track.assets.some((asset) => asset.isLossless),
  );
  const trackAssetCount = release.tracks.reduce(
    (sum, track) => sum + track.assets.length,
    0,
  );
  const qualityDisclosureRequired =
    release.isLossyOnly || (trackAssetCount > 0 && !hasLosslessMasters);
  const releaseDateValue =
    "releaseDate" in release &&
    release.releaseDate &&
    release.releaseDate instanceof Date
      ? release.releaseDate
      : release.createdAt;

  return {
    id: release.id,
    artistId: release.artistId,
    title: release.title,
    slug: release.slug,
    description: release.description,
    coverImageUrl: release.coverImageUrl,
    pricingMode: release.pricingMode,
    fixedPriceCents: release.fixedPriceCents,
    minimumPriceCents: release.minimumPriceCents,
    priceCents: release.priceCents,
    currency: release.currency,
    status: release.status,
    releaseDate: releaseDateValue.toISOString(),
    publishedAt: release.publishedAt?.toISOString() ?? null,
    deletedAt: release.deletedAt?.toISOString() ?? null,
    isLossyOnly: release.isLossyOnly,
    qualityDisclosureRequired,
    hasLosslessMasters,
    trackAssetCount,
    createdAt: release.createdAt.toISOString(),
    updatedAt: release.updatedAt.toISOString(),
    artist: {
      id: release.artist.id,
      name: release.artist.name,
      deletedAt: release.artist.deletedAt?.toISOString() ?? null,
    },
    _count: {
      tracks: release._count.tracks,
      files: release._count.files,
      orderItems: release._count.orderItems,
    },
  };
}
