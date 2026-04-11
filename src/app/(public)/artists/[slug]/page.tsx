import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import ArtistBio from "@/app/(public)/release/artist-bio";
import { buyerTheme } from "@/app/(public)/buyer-theme";
import { ArtistImageDialog } from "./artist-image-dialog";
import StorefrontHeader from "@/app/(public)/storefront-header";
import { prisma } from "@/lib/prisma";
import { resolveStorefrontBrandLabel } from "@/lib/storefront-brand";

const DEFAULT_COVER_SRC = "/default-artwork.png";

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

function resolveArtistAvatarSrc(input: {
  artistImageUrl: string | null | undefined;
  ownerImageUrl: string | null | undefined;
}) {
  const artistImageUrl = resolveOptionalImageUrl(input.artistImageUrl);
  if (artistImageUrl) {
    return `/api/cover?url=${encodeURIComponent(artistImageUrl)}`;
  }

  const ownerImageUrl = resolveOptionalImageUrl(input.ownerImageUrl);
  if (!ownerImageUrl) {
    return null;
  }

  return `/api/cover?url=${encodeURIComponent(ownerImageUrl)}`;
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

function formatStorefrontPrice(input: {
  pricingMode: "FREE" | "FIXED" | "PWYW";
  currency: string;
  priceCents: number;
  fixedPriceCents: number | null;
  minimumPriceCents: number | null;
}) {
  const format = (cents: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: input.currency || "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(cents / 100);

  if (input.pricingMode === "FREE") {
    return "Free";
  }

  if (input.pricingMode === "FIXED") {
    return format(input.fixedPriceCents ?? input.priceCents);
  }

  const minimum = input.minimumPriceCents ?? 0;
  if (minimum <= 0) {
    return "Pay what you want";
  }
  return `From ${format(minimum)}`;
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

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: ArtistDetailPageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const slug = resolvedParams.slug?.trim();
  if (!slug) {
    return { title: { absolute: "Artist" } };
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

  const artist =
    settings?.organizationId
      ? await prisma.artist.findFirst({
          where: {
            organizationId: settings.organizationId,
            slug,
            deletedAt: null,
          },
          select: {
            name: true,
          },
        })
      : null;

  if (!artist) {
    return {
      title: {
        absolute: `Artist | ${brandLabel}`,
      },
    };
  }

  return {
    title: {
      absolute: `${artist.name} | ${brandLabel}`,
    },
  };
}

type ArtistDetailPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function ArtistDetailPage({ params }: ArtistDetailPageProps) {
  const resolvedParams = await params;
  const slug = resolvedParams.slug?.trim();
  if (!slug) {
    notFound();
  }

  const settings = await prisma.storeSettings.findFirst({
    select: {
      organizationId: true,
    },
    orderBy: { createdAt: "asc" },
  });

  if (!settings?.organizationId) {
    notFound();
  }

  const artist = await prisma.artist.findFirst({
    where: {
      organizationId: settings.organizationId,
      slug,
      deletedAt: null,
    },
    select: {
      id: true,
      slug: true,
      name: true,
      imageUrl: true,
      location: true,
      bio: true,
      owner: {
        select: {
          image: true,
        },
      },
      releases: {
        where: {
          status: "PUBLISHED",
          deletedAt: null,
          publishedAt: { not: null },
        },
        orderBy: [{ releaseDate: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          title: true,
          slug: true,
          coverImageUrl: true,
          pricingMode: true,
          priceCents: true,
          fixedPriceCents: true,
          minimumPriceCents: true,
          currency: true,
          releaseDate: true,
          _count: {
            select: {
              tracks: true,
            },
          },
        },
      },
    },
  });

  if (!artist) {
    notFound();
  }

  const artistImageUrl = resolveArtistAvatarSrc({
    artistImageUrl: artist.imageUrl,
    ownerImageUrl: artist.owner?.image,
  });

  return (
    <div className={buyerTheme.page}>
      <StorefrontHeader activePage="artists" />

      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12"
      >
        <section className="rounded-2xl border border-zinc-200 bg-white/80 p-5 shadow-[0_24px_64px_-44px_rgba(15,23,42,0.35)] backdrop-blur sm:p-6">
          <Link
            href="/artists"
            className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500 transition hover:text-emerald-700"
          >
            Artists
          </Link>
          <div className="mt-3 flex items-start gap-4">
            {artistImageUrl ? (
              <ArtistImageDialog artistName={artist.name} imageUrl={artistImageUrl} />
            ) : (
              <span className="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-zinc-300 bg-zinc-200 text-lg font-semibold text-zinc-700">
                {resolveInitials(artist.name)}
              </span>
            )}

            <div>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{artist.name}</h1>
              {artist.location ? (
                <p className="mt-1 text-sm text-zinc-600">{artist.location}</p>
              ) : null}
              {artist.bio ? (
                <div className="mt-3 max-w-3xl">
                  <ArtistBio bio={artist.bio} collapsible={false} />
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-semibold tracking-tight">Releases</h2>

          {artist.releases.length === 0 ? (
            <div className={`${buyerTheme.statusNeutral} mt-4 w-full`}>
              No published releases yet for this artist.
            </div>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {artist.releases.map((release) => (
                <article
                  key={release.id}
                  className="overflow-hidden rounded-2xl border border-zinc-200 bg-white/90 shadow-[0_24px_64px_-44px_rgba(15,23,42,0.35)]"
                >
                  <Link
                    href={`/release/${release.slug}`}
                    aria-label={`Open release ${release.title}`}
                    className="group relative block aspect-square w-full overflow-hidden border-b border-zinc-200 bg-zinc-100"
                  >
                    <Image
                      src={resolveCoverSrc(release.coverImageUrl)}
                      alt={`${release.title} cover`}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover transition-transform duration-300 ease-out group-hover:scale-[1.04]"
                    />
                  </Link>

                  <div className="p-4">
                    <h3 className="line-clamp-2 text-lg font-semibold tracking-tight text-zinc-950">
                      <Link
                        href={`/release/${release.slug}`}
                        className="transition hover:text-emerald-700"
                      >
                        {release.title}
                      </Link>
                    </h3>

                    <div className="mt-2 flex items-center justify-between gap-2 text-sm">
                      <p className="font-medium text-zinc-800">
                        {formatStorefrontPrice({
                          pricingMode: release.pricingMode,
                          currency: release.currency,
                          priceCents: release.priceCents,
                          fixedPriceCents: release.fixedPriceCents,
                          minimumPriceCents: release.minimumPriceCents,
                        })}
                      </p>
                      <p className="text-xs text-zinc-500">{formatReleaseDate(release.releaseDate)}</p>
                    </div>

                    <p className="mt-1 text-xs text-zinc-500">{release._count.tracks} tracks</p>

                    <div className="mt-4">
                      <Link
                        href={`/release/${release.slug}`}
                        className="inline-flex items-center rounded-xl border border-zinc-300 px-3 py-1.5 text-sm font-semibold text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-100"
                      >
                        View Release
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
