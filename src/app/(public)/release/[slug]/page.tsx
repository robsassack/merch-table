import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";

import { buyerTheme } from "@/app/(public)/buyer-theme";
import ArtistBio from "@/app/(public)/release/artist-bio";
import ReleaseArtworkTheme from "@/app/(public)/release/release-artwork-theme";
import { type ReleaseAudioTrack } from "@/app/(public)/release/release-audio-player";
import ReleaseAudioPlayerConfigurator from "@/app/(public)/release/release-audio-player-configurator";
import ReleaseDescription from "@/app/(public)/release/release-description";
import ReleaseDetailPurchaseCard from "@/app/(public)/release/release-detail-purchase-card";
import ReleaseArtworkPlayToggle from "@/app/(public)/release/release-artwork-play-toggle";
import ReleaseTrackList from "@/app/(public)/release/release-track-list";
import {
  formatReleaseDate,
  formatReleaseType,
  formatReleaseYear,
  formatTotalDuration,
  resolveArtistAvatarSrc,
  resolveCoverSrc,
  resolveInitials,
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
import { IMAGE_BLUR_DATA_URL } from "@/lib/ui/image-blur";

type ReleaseDetailPageProps = {
  params: Promise<{ slug: string }>;
};

const spaceMonoFontFamily = 'var(--font-space-mono), "Space Mono", monospace';

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

      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto mb-12 w-full max-w-6xl px-4 pt-6 pb-10 sm:px-6 sm:pt-8 sm:pb-12"
      >
        <ReleaseAudioPlayerConfigurator
          tracks={releasePlayerTracks}
          featuredTrackId={release.featuredTrackId}
          coverSrc={releaseCoverSrc}
          fallbackArtistName={release.artist.name}
        />

        <section className="sm:px-1">
            <div className="grid gap-5 lg:grid-cols-[minmax(220px,380px)_1fr]">
              <ReleaseArtworkPlayToggle
                coverSrc={releaseCoverSrc}
                releaseTitle={release.title}
                previewTrackId={releasePreviewTrackId}
                playablePreviewTrackIds={releasePlayablePreviewTrackIds}
              />

              <div className="flex flex-col">
                <p
                  className="text-[11px] font-semibold uppercase tracking-[0.22em]"
                  style={{ color: "var(--release-accent-text)" }}
                >
                  {formatReleaseType(release.releaseType)}
                </p>
                <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">
                  {release.title}
                </h1>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-zinc-700">
                  <Link
                    href={`/artists/${release.artist.slug}`}
                    className="font-medium text-zinc-900 transition hover:text-[var(--release-accent-hover)]"
                  >
                    {release.artist.name}
                  </Link>
                  <span aria-hidden>•</span>
                  <span>{formatReleaseYear(release.releaseDate) ?? "Unknown date"}</span>
                  <span aria-hidden>•</span>
                  <span>{release._count.tracks} tracks</span>
                  <span aria-hidden>•</span>
                  <span>{formatTotalDuration(totalDurationMs)}</span>
                </div>

                {release.description ? <ReleaseDescription description={release.description} /> : null}

                {release.isLossyOnly ? (
                  <div className={`${buyerTheme.statusError} mt-4`}>
                    This release currently has only lossy source audio. Lossless downloads may be unavailable.
                  </div>
                ) : null}

                <div className="mt-5">
                  <ReleaseDetailPurchaseCard
                    releaseId={release.id}
                    previewTrackId={releasePreviewTrackId}
                    playablePreviewTrackIds={releasePlayablePreviewTrackIds}
                    pricingMode={release.pricingMode}
                    currency={release.currency}
                    fixedPriceCents={release.fixedPriceCents}
                    minimumPriceCents={release.minimumPriceCents}
                    initialMayOwnRelease={hasOwnedReleaseHint}
                    hasDownloadableTracks={downloadableSourceAssets.length > 0}
                    hasOnlyLossyDownloads={
                      downloadableSourceAssets.length > 0 && release.isLossyOnly
                    }
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <article>
              <div className="flex items-end justify-between gap-2">
                <h2 className="text-xl font-semibold tracking-tight">Tracklist</h2>
                <p className="text-sm text-zinc-500" style={{ fontFamily: spaceMonoFontFamily }}>
                  {release._count.tracks} tracks • {formatTotalDuration(totalDurationMs)}
                </p>
              </div>

              {releaseTracks.length === 0 ? (
                <div className={`${buyerTheme.statusNeutral} mt-4`}>No tracks published yet.</div>
              ) : (
                <ReleaseTrackList tracks={releaseTracks} />
              )}
            </article>

            <div className="space-y-6">
              <article>
                <h2 className="text-xl font-semibold tracking-tight">About the Artist</h2>
                <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4">
                  <div className="flex items-start gap-3">
                    {artistImageUrl ? (
                      <span className="relative inline-flex h-12 w-12 shrink-0 overflow-hidden rounded-full border border-zinc-200 bg-zinc-100">
                        <Image
                          src={artistImageUrl}
                          alt={`${release.artist.name} profile`}
                          fill
                          sizes="48px"
                          placeholder="blur"
                          blurDataURL={IMAGE_BLUR_DATA_URL}
                          className="object-cover"
                        />
                      </span>
                    ) : (
                      <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-zinc-300 bg-zinc-200 text-sm font-semibold text-zinc-700">
                        {resolveInitials(release.artist.name)}
                      </span>
                    )}

                    <div className="min-w-0">
                      <p className="font-semibold text-zinc-900">{release.artist.name}</p>
                      {release.artist.location ? (
                        <p className="text-sm text-zinc-600">{release.artist.location}</p>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-3">
                    <ArtistBio bio={release.artist.bio} />
                  </div>

                  <div className="mt-4">
                    <Link
                      href={`/artists/${release.artist.slug}`}
                      className="inline-flex items-center rounded-xl border border-zinc-300 px-3 py-1.5 text-sm font-semibold text-zinc-700 transition hover:border-[var(--release-accent)] hover:bg-[var(--release-bg-start)]"
                    >
                      View Artist
                    </Link>
                  </div>
                </div>
              </article>

              <article>
                <h2 className="text-xl font-semibold tracking-tight">Release Info</h2>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-zinc-500">Released</dt>
                    <dd
                      className="font-medium text-zinc-900"
                      style={{ fontFamily: spaceMonoFontFamily }}
                    >
                      {formatReleaseDate(release.releaseDate) ?? "Unknown"}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-zinc-500">Label</dt>
                    <dd
                      className="font-medium text-zinc-900"
                      style={{ fontFamily: spaceMonoFontFamily }}
                    >
                      {release.label}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="text-zinc-500">Formats</dt>
                    <dd
                      className="text-right font-medium text-zinc-900"
                      style={{ fontFamily: spaceMonoFontFamily }}
                    >
                      {availableDownloadFormats.length > 0
                        ? availableDownloadFormats.map((format) => format.toUpperCase()).join(", ")
                        : "None"}
                    </dd>
                  </div>
                </dl>
              </article>
            </div>
          </section>

        {settings.contactEmail ? (
          <section className="mt-8">
            <p className="text-sm text-zinc-700">
              Need help with this release? Contact{" "}
              <a
                href={`mailto:${settings.contactEmail}`}
                className="font-medium text-zinc-900 underline underline-offset-2 hover:text-[var(--release-accent-hover)]"
              >
                {settings.contactEmail}
              </a>
              .
            </p>
          </section>
        ) : null}
      </main>
    </ReleaseArtworkTheme>
  );
}
