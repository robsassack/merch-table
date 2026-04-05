import Link from "next/link";
import type { Metadata } from "next";

import { buyerTheme } from "@/app/buyer-theme";
import StorefrontHeader from "@/app/storefront-header";
import { prisma } from "@/lib/prisma";

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

function ArtistAvatar({
  artistName,
  artistImageUrl,
}: {
  artistName: string;
  artistImageUrl: string | null;
}) {
  if (artistImageUrl) {
    return (
      <span className="inline-flex h-12 w-12 overflow-hidden rounded-full border border-zinc-200 bg-zinc-100">
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
    <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-zinc-300 bg-zinc-200 text-sm font-semibold text-zinc-700">
      {resolveInitials(artistName)}
    </span>
  );
}

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Artists",
};

export default async function ArtistsPage() {
  const settings = await prisma.storeSettings.findFirst({
    select: {
      organizationId: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const artists = settings?.organizationId
    ? await prisma.artist.findMany({
        where: {
          organizationId: settings.organizationId,
          deletedAt: null,
        },
        orderBy: [{ name: "asc" }],
        select: {
          id: true,
          slug: true,
          name: true,
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
            orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
            take: 3,
            select: {
              id: true,
              title: true,
              slug: true,
            },
          },
        },
      })
    : [];

  return (
    <div className={buyerTheme.page}>
      <StorefrontHeader activePage="artists" />

      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <section className="rounded-2xl border border-zinc-200 bg-white/80 p-5 shadow-[0_24px_64px_-44px_rgba(15,23,42,0.35)] backdrop-blur sm:p-6">
          <p className={buyerTheme.eyebrow}>Artists</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Explore Artists
          </h1>
          <p className={buyerTheme.subtitle}>
            Browse the artists behind the catalog and jump into their releases.
          </p>
        </section>

        <section className="mt-8">
          {artists.length === 0 ? (
            <div className={`${buyerTheme.statusNeutral} w-full`}>
              No active artists are available yet.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {artists.map((artist) => (
                <article
                  key={artist.id}
                  className="rounded-2xl border border-zinc-200 bg-white/90 p-4 shadow-[0_24px_64px_-44px_rgba(15,23,42,0.35)]"
                >
                  <div className="flex items-center gap-3">
                    <ArtistAvatar
                      artistName={artist.name}
                      artistImageUrl={resolveOptionalImageUrl(artist.owner?.image)}
                    />
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-semibold tracking-tight text-zinc-950">
                        <Link href={`/artists/${artist.slug}`} className="transition hover:text-emerald-700">
                          {artist.name}
                        </Link>
                      </h2>
                      {artist.location ? (
                        <p className="truncate text-xs text-zinc-500">{artist.location}</p>
                      ) : null}
                    </div>
                  </div>

                  {artist.bio ? (
                    <p className="mt-4 line-clamp-3 text-sm text-zinc-600">{artist.bio}</p>
                  ) : null}

                  <div className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                      Recent Releases
                    </p>
                    {artist.releases.length > 0 ? (
                      <ul className="mt-2 space-y-1.5">
                        {artist.releases.map((release) => (
                          <li key={release.id}>
                            <Link
                              href={`/release/${release.slug}`}
                              className="text-sm text-zinc-700 transition hover:text-emerald-700"
                            >
                              {release.title}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-sm text-zinc-500">No published releases yet.</p>
                    )}
                  </div>

                  <div className="mt-5">
                    <Link
                      href={`/artists/${artist.slug}`}
                      className="inline-flex items-center rounded-xl border border-zinc-300 px-3 py-1.5 text-sm font-semibold text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-100"
                    >
                      View Artist
                    </Link>
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
