import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { buyerTheme } from "@/app/buyer-theme";
import ArtistBio from "@/app/release/artist-bio";
import ReleaseDescription from "@/app/release/release-description";
import ReleaseDetailPurchaseCard from "@/app/release/release-detail-purchase-card";
import StorefrontHeader from "@/app/storefront-header";
import { prisma } from "@/lib/prisma";
import { resolveStorefrontBrandLabel } from "@/lib/storefront-brand";

const DEFAULT_COVER_SRC = "/default-artwork.png";

type ReleaseDetailPageProps = {
  params: Promise<{ slug: string }>;
};

function resolveCoverSrc(coverImageUrl: string | null) {
  if (!coverImageUrl) {
    return DEFAULT_COVER_SRC;
  }
  return `/api/cover?url=${encodeURIComponent(coverImageUrl)}`;
}

function resolveOptionalImageUrl(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveInitials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .slice(0, 2);

  if (parts.length === 0) {
    return "A";
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function formatReleaseDate(value: Date | null) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

function formatReleaseYear(value: Date | null) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
  }).format(value);
}

function formatReleaseType(value: string) {
  const normalized = value.trim();
  if (normalized.length === 0) {
    return "Album";
  }

  switch (normalized) {
    case "ALBUM":
      return "Album";
    case "EP":
      return "EP";
    case "SINGLE":
      return "Single";
    case "COMPILATION":
      return "Compilation";
    case "MIXTAPE":
      return "Mixtape";
    case "LIVE_ALBUM":
      return "Live Album";
    case "SOUNDTRACK_SCORE":
      return "Soundtrack / Score";
    case "DEMO":
      return "Demo";
    case "BOOTLEG":
      return "Bootleg";
    case "REMIX":
      return "Remix";
    case "OTHER":
      return "Other";
    default:
      return "Album";
  }
}

function formatTrackDuration(durationMs: number | null) {
  if (!durationMs || durationMs <= 0) {
    return "0:00";
  }

  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatTotalDuration(durationMs: number) {
  if (durationMs <= 0) {
    return "0:00";
  }

  const totalSeconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

const spaceMonoFontFamily = 'var(--font-space-mono), "Space Mono", monospace';

export const dynamic = "force-dynamic";

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
      title: true,
      releaseType: true,
      label: true,
      slug: true,
      description: true,
      coverImageUrl: true,
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

  const artistImageUrl = resolveOptionalImageUrl(release.artist.owner?.image);
  const totalDurationMs = release.tracks.reduce((sum, track) => sum + (track.durationMs ?? 0), 0);

  return (
    <div className={buyerTheme.page}>
      <StorefrontHeader />

      <main className="mx-auto mb-12 w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <section className="sm:px-1">
          <div className="grid gap-5 lg:grid-cols-[minmax(220px,380px)_1fr]">
            <div className="mx-auto aspect-square w-full max-w-[26rem] overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 lg:mx-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveCoverSrc(release.coverImageUrl)}
                alt={`${release.title} cover`}
                className="h-full w-full object-cover"
              />
            </div>

            <div className="flex flex-col">
              <p className={buyerTheme.eyebrow}>{formatReleaseType(release.releaseType)}</p>
              <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">
                {release.title}
              </h1>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-zinc-700">
                <Link
                  href={`/artists/${release.artist.slug}`}
                  className="font-medium text-zinc-900 transition hover:text-emerald-700"
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
                  pricingMode={release.pricingMode}
                  currency={release.currency}
                  fixedPriceCents={release.fixedPriceCents}
                  minimumPriceCents={release.minimumPriceCents}
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

            {release.tracks.length === 0 ? (
              <div className={`${buyerTheme.statusNeutral} mt-4`}>No tracks published yet.</div>
            ) : (
              <ol className="mt-4 divide-y divide-zinc-200">
                {release.tracks.map((track) => (
                  <li
                    key={track.id}
                    className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 py-3"
                  >
                    <span
                      className="text-sm tabular-nums text-zinc-500"
                      style={{ fontFamily: spaceMonoFontFamily }}
                    >
                      {String(track.trackNumber).padStart(2, "0")}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-zinc-900">{track.title}</p>
                      {track.artistOverride ? (
                        <p className="text-xs text-zinc-500">{track.artistOverride}</p>
                      ) : null}
                    </div>
                    <span
                      className="text-sm tabular-nums text-zinc-600"
                      style={{ fontFamily: spaceMonoFontFamily }}
                    >
                      {formatTrackDuration(track.durationMs)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </article>

          <div className="space-y-6">
            <article>
              <h2 className="text-xl font-semibold tracking-tight">About the Artist</h2>
              <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4">
                <div className="flex items-start gap-3">
                  {artistImageUrl ? (
                    <span className="inline-flex h-12 w-12 shrink-0 overflow-hidden rounded-full border border-zinc-200 bg-zinc-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={artistImageUrl}
                        alt={`${release.artist.name} profile`}
                        className="h-full w-full object-cover"
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
                    className="inline-flex items-center rounded-xl border border-zinc-300 px-3 py-1.5 text-sm font-semibold text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-100"
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
                    {release.deliveryFormats.join(", ")}
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
                className="font-medium text-zinc-900 underline underline-offset-2 hover:text-emerald-700"
              >
                {settings.contactEmail}
              </a>
              .
            </p>
          </section>
        ) : null}
      </main>
    </div>
  );
}
