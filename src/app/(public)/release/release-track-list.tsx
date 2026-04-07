"use client";

import { useEffect, useMemo, useState } from "react";
import { useReleaseAudioPlayer } from "@/app/(public)/release/release-audio-player";

const spaceMonoFontFamily = 'var(--font-space-mono), "Space Mono", monospace';

type ReleaseTrackListTrack = {
  id: string;
  title: string;
  trackNumber: number;
  durationMs: number | null;
  isPlayablePreview: boolean;
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
  const { activeTrackId, isPlaybackVisuallyActive, playTrack } = useReleaseAudioPlayer();
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
      <ol className="mt-4 space-y-1">
        {tracksWithMetadata.map((track) => {
          const hasMetadata = Boolean(track.normalizedLyrics || track.normalizedCredits);
          const isActiveTrack = activeTrackId === track.id;
          const canPlayTrack = track.isPlayablePreview;
          const hasSecondaryRow = Boolean(track.artistOverride) || !track.isPlayablePreview;
          return (
            <li
              key={track.id}
              className={`rounded-xl border px-3 py-3 transition-colors ${
                isActiveTrack
                  ? "border-[var(--release-accent-soft)] bg-[var(--release-bg-start)]/70"
                  : "border-transparent"
              } ${
                canPlayTrack
                  ? "cursor-pointer hover:border-zinc-200 hover:bg-[var(--release-bg-start)]/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--release-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                  : ""
              }`}
              onClick={() => {
                if (canPlayTrack) {
                  playTrack(track.id);
                }
              }}
              onKeyDown={(event) => {
                if (!canPlayTrack) {
                  return;
                }

                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  playTrack(track.id);
                }
              }}
              role={canPlayTrack ? "button" : undefined}
              tabIndex={canPlayTrack ? 0 : undefined}
              aria-label={canPlayTrack ? `Play preview: ${track.title}` : undefined}
            >
              <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3">
                {isActiveTrack ? (
                  <span className="inline-flex h-5 w-5 items-center justify-center text-[var(--release-accent)]">
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className={`h-5 w-5 ${isPlaybackVisuallyActive ? "-translate-x-[0.5px]" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      {isPlaybackVisuallyActive ? (
                        <path d="M9 6v12M15 6v12" />
                      ) : (
                        <path d="M8 6.5v11l9-5.5-9-5.5Z" />
                      )}
                    </svg>
                  </span>
                ) : (
                  <span
                    className="text-sm tabular-nums text-zinc-500"
                    style={{ fontFamily: spaceMonoFontFamily }}
                  >
                    {String(track.trackNumber).padStart(2, "0")}
                  </span>
                )}
                {hasMetadata ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedTrackId(track.id);
                    }}
                    onKeyDown={(event) => event.stopPropagation()}
                    className="min-w-0 w-fit cursor-pointer justify-self-start text-left transition hover:text-[var(--release-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--release-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                    aria-haspopup="dialog"
                  >
                    <p className="translate-y-px text-sm font-medium text-zinc-900 underline decoration-dotted underline-offset-4">
                      {track.title}
                    </p>
                  </button>
                ) : (
                  <div className="min-w-0">
                    <p className="translate-y-px text-sm font-medium text-zinc-900">{track.title}</p>
                  </div>
                )}
                <span
                  className="text-sm tabular-nums text-zinc-600"
                  style={{ fontFamily: spaceMonoFontFamily }}
                >
                  {formatTrackDuration(track.durationMs)}
                </span>
              </div>

              {hasSecondaryRow ? (
                <div className="mt-1 grid grid-cols-[2.25rem_minmax(0,1fr)_auto] gap-3">
                  <span aria-hidden />
                  <div>
                    {track.artistOverride ? (
                      <p className="text-xs text-zinc-500">{track.artistOverride}</p>
                    ) : null}
                    <div className={`${track.artistOverride ? "mt-1" : ""} flex flex-wrap items-center gap-2`}>
                      {!track.isPlayablePreview ? (
                        <span className="text-xs text-zinc-500">Preview not ready</span>
                      ) : null}
                    </div>
                  </div>
                  <span aria-hidden />
                </div>
              ) : null}
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
                className="cursor-pointer rounded-md p-1 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--release-accent)]"
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
