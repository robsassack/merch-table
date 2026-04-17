import Image from "next/image";
import Link from "next/link";

import { buyerTheme } from "@/app/(public)/buyer-theme";
import ArtistBio from "@/app/(public)/release/artist-bio";
import ReleaseDescription from "@/app/(public)/release/release-description";
import ReleaseDetailPurchaseCard from "@/app/(public)/release/release-detail-purchase-card";
import ReleaseArtworkPlayToggle from "@/app/(public)/release/release-artwork-play-toggle";
import ReleaseTrackList from "@/app/(public)/release/release-track-list";
import {
  formatReleaseDate,
  formatReleaseType,
  formatReleaseYear,
  formatTotalDuration,
  resolveInitials,
} from "@/app/(public)/release/release-detail-page-utils";
import { IMAGE_BLUR_DATA_URL } from "@/lib/ui/image-blur";

const spaceMonoFontFamily = 'var(--font-space-mono), "Space Mono", monospace';

type ReleaseDetailMainContentProps = {
  release: {
    id: string;
    title: string;
    releaseType: string;
    description: string | null;
    isLossyOnly: boolean;
    pricingMode: React.ComponentProps<typeof ReleaseDetailPurchaseCard>["pricingMode"];
    currency: string;
    fixedPriceCents: number | null;
    minimumPriceCents: number | null;
    releaseDate: Date | null;
    label: string | null;
    artist: {
      slug: string;
      name: string;
      location: string | null;
      bio: string | null;
    };
    _count: {
      tracks: number;
    };
  };
  settingsContactEmail: string | null;
  releaseCoverSrc: string;
  releasePreviewTrackId: string | null;
  releasePlayablePreviewTrackIds: string[];
  releaseTracks: Array<{
    id: string;
    title: string;
    trackNumber: number;
    durationMs: number | null;
    isPlayablePreview: boolean;
    artistOverride: string | null;
    lyrics: string | null;
    credits: string | null;
  }>;
  downloadableSourceAssetCount: number;
  availableDownloadFormats: string[];
  totalDurationMs: number;
  artistImageUrl: string | null;
  hasOwnedReleaseHint: boolean;
};

export default function ReleaseDetailMainContent({
  release,
  settingsContactEmail,
  releaseCoverSrc,
  releasePreviewTrackId,
  releasePlayablePreviewTrackIds,
  releaseTracks,
  downloadableSourceAssetCount,
  availableDownloadFormats,
  totalDurationMs,
  artistImageUrl,
  hasOwnedReleaseHint,
}: ReleaseDetailMainContentProps) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto mb-12 w-full max-w-6xl px-4 pt-6 pb-10 sm:px-6 sm:pt-8 sm:pb-12"
    >
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
                hasDownloadableTracks={downloadableSourceAssetCount > 0}
                hasOnlyLossyDownloads={downloadableSourceAssetCount > 0 && release.isLossyOnly}
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
                <dd className="font-medium text-zinc-900" style={{ fontFamily: spaceMonoFontFamily }}>
                  {formatReleaseDate(release.releaseDate) ?? "Unknown"}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-zinc-500">Label</dt>
                <dd className="font-medium text-zinc-900" style={{ fontFamily: spaceMonoFontFamily }}>
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

      {settingsContactEmail ? (
        <section className="mt-8">
          <p className="text-sm text-zinc-700">
            Need help with this release? Contact{" "}
            <a
              href={`mailto:${settingsContactEmail}`}
              className="font-medium text-zinc-900 underline underline-offset-2 hover:text-[var(--release-accent-hover)]"
            >
              {settingsContactEmail}
            </a>
            .
          </p>
        </section>
      ) : null}
    </main>
  );
}
