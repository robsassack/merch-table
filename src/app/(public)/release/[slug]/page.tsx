import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";

import ReleaseArtworkTheme from "@/app/(public)/release/release-artwork-theme";
import { type ReleaseAudioTrack } from "@/app/(public)/release/release-audio-player";
import ReleaseAudioPlayerConfigurator from "@/app/(public)/release/release-audio-player-configurator";
import ReleaseDetailMainContent from "@/app/(public)/release/[slug]/release-detail-main-content";
import {
  resolveArtistAvatarSrc,
  resolveCoverSrc,
  resolveOptionalImageUrl,
  resolvePreviewTrackId,
  sortDownloadFormats,
} from "@/app/(public)/release/release-detail-page-utils";
import { resolveStorefrontPreviewAsset } from "@/lib/audio/preview-source";
import { resolveReleaseFileFormat } from "@/lib/checkout/download-format";
import { hasOwnedReleaseHintFromCookieStore } from "@/lib/checkout/owned-release-hint-cookie";
import { resolveCurrentReleaseSourceAssets } from "@/lib/checkout/release-files";
import StorefrontHeader from "@/app/(public)/storefront-header";
import { prismaReleaseSupportsField } from "@/lib/admin/release-management";
import { prisma } from "@/lib/prisma";
import { resolveReleasePaletteFromArtworkUrl } from "@/lib/release-artwork-palette";
import { parseReleaseArtworkPaletteCookie, RELEASE_ARTWORK_PALETTE_COOKIE_NAME } from "@/lib/release-artwork-palette-cookie";
import {
  parseReleasePaletteRecord,
  resolveReleasePaletteCoverKey,
  serializeReleasePaletteRecord,
} from "@/lib/release-artwork-palette-shared";
import { resolveStorefrontBrandLabel } from "@/lib/storefront-brand";

type ReleaseDetailPageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamic = "force-dynamic";

function resolveRequestOrigin(headerStore: Headers) {
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  if (!host) {
    return null;
  }

  const forwardedProto = headerStore
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();
  const protocol =
    forwardedProto === "http" || forwardedProto === "https"
      ? forwardedProto
      : host.startsWith("localhost") || host.startsWith("127.0.0.1")
        ? "http"
        : "https";

  return `${protocol}://${host}`;
}

const getCachedReleaseArtworkPalette = unstable_cache(
  async (
    coverImageUrl: string | null,
    paletteVersion: string,
    coverProxyUrl: string | null,
  ) => {
    void paletteVersion;
    const directPalette = await resolveReleasePaletteFromArtworkUrl(coverImageUrl);
    if (directPalette) {
      return directPalette;
    }

    if (coverProxyUrl) {
      return resolveReleasePaletteFromArtworkUrl(coverProxyUrl);
    }

    return null;
  },
  ["release-artwork-palette"],
  { revalidate: 86_400 },
);

export async function generateMetadata({
  params,
}: ReleaseDetailPageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const slug = resolvedParams.slug?.trim();
  if (!slug) {
    return { title: { absolute: "Release" } };
  }

  const settings = await prisma.storeSettings.findFirst({
    select: {
      organizationId: true,
      storeName: true,
      brandName: true,
      organization: {
        select: { name: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const brandLabel = resolveStorefrontBrandLabel({
    storeName: settings?.storeName ?? null,
    brandName: settings?.brandName ?? null,
    organizationName: settings?.organization?.name ?? null,
  });

  const release =
    settings?.organizationId
      ? await prisma.release.findFirst({
          where: {
            organizationId: settings.organizationId,
            slug,
            status: "PUBLISHED",
            deletedAt: null,
            publishedAt: { not: null },
            artist: {
              deletedAt: null,
            },
          },
          select: {
            title: true,
            artist: {
              select: { name: true },
            },
          },
        })
      : null;

  if (!release) {
    return {
      title: {
        absolute: `Release | ${brandLabel}`,
      },
    };
  }

  return {
    title: {
      absolute: `${release.artist.name} | ${release.title} | ${brandLabel}`,
    },
  };
}

export default async function ReleaseDetailPage({ params }: ReleaseDetailPageProps) {
  const resolvedParams = await params;
  const slug = resolvedParams.slug?.trim();
  if (!slug) {
    notFound();
  }

  const settings = await prisma.storeSettings.findFirst({
    select: {
      organizationId: true,
      contactEmail: true,
    },
    orderBy: { createdAt: "asc" },
  });

  if (!settings?.organizationId) {
    notFound();
  }

  const artworkPaletteJsonSupported = prismaReleaseSupportsField(
    prisma,
    "artworkPaletteJson",
  );

  const release = await prisma.release.findFirst({
    where: {
      organizationId: settings.organizationId,
      slug,
      status: "PUBLISHED",
      deletedAt: null,
      publishedAt: { not: null },
      artist: {
        deletedAt: null,
      },
    },
    select: {
      id: true,
      featuredTrackId: true,
      title: true,
      releaseType: true,
      label: true,
      slug: true,
      description: true,
      coverImageUrl: true,
      ...(artworkPaletteJsonSupported ? { artworkPaletteJson: true } : {}),
      updatedAt: true,
      pricingMode: true,
      priceCents: true,
      fixedPriceCents: true,
      minimumPriceCents: true,
      currency: true,
      releaseDate: true,
      isLossyOnly: true,
      deliveryFormats: true,
      artist: {
        select: {
          slug: true,
          name: true,
          imageUrl: true,
          updatedAt: true,
          location: true,
          bio: true,
          owner: {
            select: {
              image: true,
            },
          },
        },
      },
      tracks: {
        orderBy: [{ trackNumber: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          title: true,
          trackNumber: true,
          durationMs: true,
          artistOverride: true,
          lyrics: true,
          credits: true,
          previewMode: true,
          previewSeconds: true,
          assets: {
            orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
            select: {
              id: true,
              assetRole: true,
              format: true,
              isLossless: true,
              updatedAt: true,
              storageKey: true,
              mimeType: true,
            },
          },
        },
      },
      _count: {
        select: {
          tracks: true,
        },
      },
    },
  });

  if (!release) {
    notFound();
  }

  const downloadableSourceAssets = await resolveCurrentReleaseSourceAssets({
    db: prisma,
    releaseId: release.id,
    organizationId: settings.organizationId,
  });
  const availableDownloadFormats = sortDownloadFormats(
    Array.from(
      new Set(
        downloadableSourceAssets
          .map((asset) =>
            resolveReleaseFileFormat({
              fileName: asset.storageKey,
              mimeType: asset.mimeType,
            }),
          )
          .filter((value): value is "mp3" | "m4a" | "flac" => value !== null),
      ),
    ),
  );

  const releaseTracks = release.tracks.map((track) => {
    const previewAsset = resolveStorefrontPreviewAsset({
      previewMode: track.previewMode,
      assets: track.assets,
    });
    const isPlayablePreview = previewAsset !== null;

    return {
      id: track.id,
      title: track.title,
      artistName: track.artistOverride?.trim() ? track.artistOverride : release.artist.name,
      trackNumber: track.trackNumber,
      durationMs: track.durationMs,
      previewFormat: previewAsset?.format ?? null,
      previewVersion: `${track.previewMode}:${track.previewMode === "CLIP" ? String(track.previewSeconds ?? 30) : "na"}:${previewAsset?.id ?? "none"}`,
      artistOverride: track.artistOverride,
      lyrics: track.lyrics,
      credits: track.credits,
      isPlayablePreview,
    };
  });
  const releasePlayerTracks: ReleaseAudioTrack[] = releaseTracks.map((track) => ({
    id: track.id,
    title: track.title,
    artistName: track.artistName,
    trackNumber: track.trackNumber,
    durationMs: track.durationMs,
    isPlayablePreview: track.isPlayablePreview,
    previewFormat: track.previewFormat,
    previewUrl: `/api/release/tracks/${encodeURIComponent(track.id)}/preview?v=${encodeURIComponent(track.previewVersion)}`,
  }));
  const releasePreviewTrackId = resolvePreviewTrackId(
    releasePlayerTracks,
    release.featuredTrackId,
  );
  const releasePlayablePreviewTrackIds = releasePlayerTracks
    .filter((track) => track.isPlayablePreview)
    .map((track) => track.id);
  const artistImageUrl = resolveArtistAvatarSrc({
    artistImageUrl: release.artist.imageUrl,
    ownerImageUrl: release.artist.owner?.image,
    version: release.artist.updatedAt.getTime(),
  });
  const totalDurationMs = releaseTracks.reduce((sum, track) => sum + (track.durationMs ?? 0), 0);
  const hasArtwork = resolveOptionalImageUrl(release.coverImageUrl) !== null;
  const releaseCoverSrc = resolveCoverSrc(
    release.coverImageUrl,
    release.updatedAt.getTime(),
  );
  const requestHeaders = await headers();
  const requestOrigin = resolveRequestOrigin(requestHeaders);
  const coverProxyUrl =
    hasArtwork && requestOrigin && releaseCoverSrc.startsWith("/api/cover?")
      ? `${requestOrigin}${releaseCoverSrc}`
      : null;
  const persistedPaletteRecord = parseReleasePaletteRecord(
    "artworkPaletteJson" in release ? release.artworkPaletteJson : null,
  );
  const currentCoverKey = resolveReleasePaletteCoverKey(release.coverImageUrl);
  const persistedInitialPalette =
    persistedPaletteRecord &&
    (!persistedPaletteRecord.coverKey || persistedPaletteRecord.coverKey === currentCoverKey)
      ? persistedPaletteRecord.palette
      : null;
  const cookieStore = await cookies();
  const browserCachedPalette = parseReleaseArtworkPaletteCookie(
    cookieStore.get(RELEASE_ARTWORK_PALETTE_COOKIE_NAME)?.value,
    releaseCoverSrc,
  );
  const cachedInitialPalette =
    !persistedInitialPalette && hasArtwork
      ? await getCachedReleaseArtworkPalette(
          release.coverImageUrl,
          `${release.id}:${release.updatedAt.getTime()}`,
          coverProxyUrl,
        )
      : null;
  const runtimeInitialPalette =
    !persistedInitialPalette && !cachedInitialPalette && hasArtwork
      ? await resolveReleasePaletteFromArtworkUrl(coverProxyUrl ?? release.coverImageUrl)
      : null;
  const initialPalette =
    browserCachedPalette ??
    persistedInitialPalette ??
    cachedInitialPalette ??
    runtimeInitialPalette;

  const persistedPaletteNeedsBackfill =
    Boolean(initialPalette) &&
    (!persistedPaletteRecord ||
      !persistedPaletteRecord.coverKey ||
      persistedPaletteRecord.coverKey !== currentCoverKey);
  if (artworkPaletteJsonSupported && persistedPaletteNeedsBackfill && initialPalette) {
    const nextArtworkPaletteJson = serializeReleasePaletteRecord({
      palette: initialPalette,
      coverKey: currentCoverKey,
    });
    const currentArtworkPaletteJson =
      "artworkPaletteJson" in release ? release.artworkPaletteJson : null;
    if (nextArtworkPaletteJson && nextArtworkPaletteJson !== currentArtworkPaletteJson) {
      await prisma.release
        .updateMany({
          where: {
            id: release.id,
          },
          data: {
            artworkPaletteJson: nextArtworkPaletteJson,
          },
        })
        .catch(() => undefined);
    }
  }
  const hasOwnedReleaseHint = hasOwnedReleaseHintFromCookieStore(
    cookieStore,
    release.id,
  );

  return (
    <ReleaseArtworkTheme
      coverSrc={releaseCoverSrc}
      hasArtwork={hasArtwork}
      initialPalette={initialPalette}
    >
      <StorefrontHeader />
      <ReleaseAudioPlayerConfigurator
        tracks={releasePlayerTracks}
        featuredTrackId={release.featuredTrackId}
        coverSrc={releaseCoverSrc}
        fallbackArtistName={release.artist.name}
      />
      <ReleaseDetailMainContent
        release={release}
        settingsContactEmail={settings.contactEmail}
        releaseCoverSrc={releaseCoverSrc}
        releasePreviewTrackId={releasePreviewTrackId}
        releasePlayablePreviewTrackIds={releasePlayablePreviewTrackIds}
        releaseTracks={releaseTracks}
        downloadableSourceAssetCount={downloadableSourceAssets.length}
        availableDownloadFormats={availableDownloadFormats}
        totalDurationMs={totalDurationMs}
        artistImageUrl={artistImageUrl}
        hasOwnedReleaseHint={hasOwnedReleaseHint}
      />
    </ReleaseArtworkTheme>
  );
}
