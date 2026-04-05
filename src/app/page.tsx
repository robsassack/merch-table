import Link from "next/link";
import type { Metadata } from "next";

import { buyerTheme } from "@/app/buyer-theme";
import StorefrontHeader from "@/app/storefront-header";
import { prisma } from "@/lib/prisma";

function resolveCoverSrc(coverImageUrl: string | null) {
  if (!coverImageUrl) {
    return null;
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

function ArtistAvatar({
  artistName,
  artistImageUrl,
}: {
  artistName: string;
  artistImageUrl: string | null;
}) {
  if (artistImageUrl) {
    return (
      <span className="inline-flex h-9 w-9 overflow-hidden rounded-full border border-zinc-200 bg-zinc-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={artistImageUrl}
          alt={`${artistName} profile`}
          className="h-full w-full object-cover"
        />
      </span>
    );
  }

  return (
    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-zinc-300 bg-zinc-200 text-xs font-semibold text-zinc-700">
      {resolveInitials(artistName)}
    </span>
  );
}

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Catalog",
};

export default async function Home() {
  const settings = await prisma.storeSettings.findFirst({
    select: {
      organizationId: true,
      featuredReleaseId: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const releases = settings?.organizationId
    ? await prisma.release.findMany({
        where: {
          organizationId: settings.organizationId,
          status: "PUBLISHED",
          deletedAt: null,
          publishedAt: { not: null },
          artist: {
            deletedAt: null,
          },
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
          artist: {
            select: {
              slug: true,
              name: true,
              owner: {
                select: {
                  image: true,
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
      })
    : [];

  const featured =
    (settings?.featuredReleaseId
      ? releases.find((release) => release.id === settings.featuredReleaseId) ?? null
      : null) ??
    releases[0] ??
    null;
  const additionalReleases = featured
    ? releases.filter((release) => release.id !== featured.id)
    : releases;

  return (
    <div className={buyerTheme.page}>
      <StorefrontHeader activePage="home" />

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {featured ? (
          <section className="rounded-2xl border border-zinc-200 bg-white/90 p-4 shadow-[0_24px_64px_-44px_rgba(15,23,42,0.35)] sm:p-6">
            <div className="grid items-center gap-5 md:grid-cols-[minmax(240px,340px)_1fr]">
              <Link
                href={`/release/${featured.slug}`}
                aria-label={`Open release ${featured.title}`}
                className="group block aspect-square w-full overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100"
              >
                {featured.coverImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={resolveCoverSrc(featured.coverImageUrl) ?? undefined}
                    alt={`${featured.title} cover`}
                    className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.04]"
                  />
                ) : (
                  <div className="h-full w-full bg-[radial-gradient(circle_at_22%_20%,#f43f5e_0%,transparent_35%),radial-gradient(circle_at_78%_75%,#0ea5e9_0%,transparent_40%),linear-gradient(145deg,#121317_0%,#09090a_100%)] transition-transform duration-300 ease-out group-hover:scale-[1.04]" />
                )}
              </Link>

              <div>
                <p className={buyerTheme.eyebrow}>Featured Release</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                  <Link
                    href={`/release/${featured.slug}`}
                    className="transition hover:text-emerald-700"
                  >
                    {featured.title}
                  </Link>
                </h2>

                <div className="mt-3 flex items-center gap-3">
                  <Link href={`/artists/${featured.artist.slug}`} aria-label={`Open artist ${featured.artist.name}`}>
                    <ArtistAvatar
                      artistName={featured.artist.name}
                      artistImageUrl={resolveOptionalImageUrl(featured.artist.owner?.image)}
                    />
                  </Link>
                  <div>
                    <Link
                      href={`/artists/${featured.artist.slug}`}
                      className="text-sm font-semibold text-zinc-900 transition hover:text-emerald-700"
                    >
                      {featured.artist.name}
                    </Link>
                    <p className="text-xs text-zinc-500">
                      {featured._count.tracks} tracks
                      {formatReleaseDate(featured.releaseDate)
                        ? ` • ${formatReleaseDate(featured.releaseDate)}`
                        : ""}
                    </p>
                  </div>
                </div>

                <p className="mt-4 text-sm font-medium text-zinc-800">
                  {formatStorefrontPrice({
                    pricingMode: featured.pricingMode,
                    currency: featured.currency,
                    priceCents: featured.priceCents,
                    fixedPriceCents: featured.fixedPriceCents,
                    minimumPriceCents: featured.minimumPriceCents,
                  })}
                </p>

                <div className="mt-5">
                  <Link href={`/release/${featured.slug}`} className={buyerTheme.buttonPrimary}>
                    Open Release
                  </Link>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {additionalReleases.length > 0 || !featured ? (
          <section className="mt-8">
            <div className="mb-4">
              <h2 className="text-xl font-semibold tracking-tight">All Releases</h2>
            </div>

            {additionalReleases.length === 0 ? (
              <div className={`${buyerTheme.statusNeutral} w-full`}>
                No published releases yet. Check back soon.
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {additionalReleases.map((release) => (
                  <article
                    key={release.id}
                    className="overflow-hidden rounded-2xl border border-zinc-200 bg-white/90 shadow-[0_24px_64px_-44px_rgba(15,23,42,0.35)]"
                  >
                    <Link
                      href={`/release/${release.slug}`}
                      aria-label={`Open release ${release.title}`}
                      className="group block aspect-square w-full overflow-hidden border-b border-zinc-200 bg-zinc-100"
                    >
                      {release.coverImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={resolveCoverSrc(release.coverImageUrl) ?? undefined}
                          alt={`${release.title} cover`}
                          className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.04]"
                        />
                      ) : (
                        <div className="h-full w-full bg-[radial-gradient(circle_at_22%_20%,#f43f5e_0%,transparent_35%),radial-gradient(circle_at_78%_75%,#0ea5e9_0%,transparent_40%),linear-gradient(145deg,#121317_0%,#09090a_100%)] transition-transform duration-300 ease-out group-hover:scale-[1.04]" />
                      )}
                    </Link>

                    <div className="p-4">
                      <div className="flex items-center gap-3">
                        <Link href={`/artists/${release.artist.slug}`} aria-label={`Open artist ${release.artist.name}`}>
                          <ArtistAvatar
                            artistName={release.artist.name}
                            artistImageUrl={resolveOptionalImageUrl(release.artist.owner?.image)}
                          />
                        </Link>
                      <div className="min-w-0">
                        <Link
                          href={`/artists/${release.artist.slug}`}
                          className="block truncate text-sm font-semibold text-zinc-900 transition hover:text-emerald-700"
                        >
                          {release.artist.name}
                        </Link>
                        <p className="text-xs text-zinc-500">
                          {release._count.tracks} tracks
                        </p>
                      </div>
                    </div>

                      <h3 className="mt-4 line-clamp-2 text-lg font-semibold tracking-tight text-zinc-950">
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
                        <p className="text-xs text-zinc-500">
                          {formatReleaseDate(release.releaseDate)}
                        </p>
                      </div>

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
        ) : null}
      </main>
    </div>
  );
}
