"use client";

import { useEffect, useMemo, useState } from "react";

const spaceMonoFontFamily = 'var(--font-space-mono), "Space Mono", monospace';

type ReleaseTrackListTrack = {
  id: string;
  title: string;
  trackNumber: number;
  durationMs: number | null;
  artistOverride: string | null;
  lyrics: string | null;
  credits: string | null;
};

type ReleaseTrackListProps = {
  tracks: ReleaseTrackListTrack[];
};

function normalizeOptionalText(value: string | null) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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

export default function ReleaseTrackList({ tracks }: ReleaseTrackListProps) {
  const tracksWithMetadata = useMemo(
    () =>
      tracks.map((track) => ({
        ...track,
        normalizedLyrics: normalizeOptionalText(track.lyrics),
        normalizedCredits: normalizeOptionalText(track.credits),
      })),
    [tracks],
  );
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);

  const selectedTrack = useMemo(
    () => tracksWithMetadata.find((track) => track.id === selectedTrackId) ?? null,
    [selectedTrackId, tracksWithMetadata],
  );

  useEffect(() => {
    if (!selectedTrack) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedTrackId(null);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedTrack]);

  return (
    <>
      <ol className="mt-4 divide-y divide-zinc-200">
        {tracksWithMetadata.map((track) => {
          const hasMetadata = Boolean(track.normalizedLyrics || track.normalizedCredits);
          return (
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

              {hasMetadata ? (
                <button
                  type="button"
                  onClick={() => setSelectedTrackId(track.id)}
                  className="text-left transition hover:text-[var(--release-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--release-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                  aria-haspopup="dialog"
                >
                  <p className="text-sm font-medium text-zinc-900 underline decoration-dotted underline-offset-4">
                    {track.title}
                  </p>
                  {track.artistOverride ? (
                    <p className="text-xs text-zinc-500">{track.artistOverride}</p>
                  ) : null}
                </button>
              ) : (
                <div>
                  <p className="text-sm font-medium text-zinc-900">{track.title}</p>
                  {track.artistOverride ? (
                    <p className="text-xs text-zinc-500">{track.artistOverride}</p>
                  ) : null}
                </div>
              )}

              <span
                className="text-sm tabular-nums text-zinc-600"
                style={{ fontFamily: spaceMonoFontFamily }}
              >
                {formatTrackDuration(track.durationMs)}
              </span>
            </li>
          );
        })}
      </ol>

      {selectedTrack ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/55 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="track-meta-dialog-title"
          onClick={() => setSelectedTrackId(null)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <h3 id="track-meta-dialog-title" className="text-base font-semibold text-zinc-900">
                {selectedTrack.title}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedTrackId(null)}
                className="rounded-md p-1 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--release-accent)]"
                aria-label="Close track details dialog"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-5 w-5 stroke-current"
                  fill="none"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </button>
            </div>

            <div className="min-h-0 overflow-y-auto pr-1">
              {selectedTrack.normalizedCredits ? (
                <section className={selectedTrack.normalizedLyrics ? "mb-4" : undefined}>
                  <h4 className="text-sm font-semibold text-zinc-900">Credits</h4>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700">
                    {selectedTrack.normalizedCredits}
                  </p>
                </section>
              ) : null}

              {selectedTrack.normalizedLyrics ? (
                <section>
                  <h4 className="text-sm font-semibold text-zinc-900">Lyrics</h4>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700">
                    {selectedTrack.normalizedLyrics}
                  </p>
                </section>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
