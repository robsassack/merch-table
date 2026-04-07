"use client";

import { useReleaseAudioPlayer } from "@/app/(public)/release/release-audio-player";

type ReleaseArtworkPlayToggleProps = {
  coverSrc: string;
  releaseTitle: string;
};

export default function ReleaseArtworkPlayToggle({
  coverSrc,
  releaseTitle,
}: ReleaseArtworkPlayToggleProps) {
  const { hasPlayableTracks, isPlaybackVisuallyActive, toggleActiveTrackPlayback } =
    useReleaseAudioPlayer();
  const artworkAriaLabel = hasPlayableTracks
    ? `${isPlaybackVisuallyActive ? "Pause" : "Play"} preview`
    : "Preview unavailable";

  return (
    <button
      type="button"
      disabled={!hasPlayableTracks}
      onClick={toggleActiveTrackPlayback}
      aria-label={artworkAriaLabel}
      className="group relative mx-auto aspect-square w-full max-w-[26rem] overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--release-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-white lg:mx-0 disabled:cursor-default"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={coverSrc}
        alt={`${releaseTitle} cover`}
        className={`h-full w-full object-cover transition duration-300 ease-out ${
          hasPlayableTracks ? "group-hover:scale-[1.035] group-hover:blur-[1.1px]" : ""
        }`}
      />

      <span aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
        {hasPlayableTracks ? (
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/88 text-zinc-900 opacity-0 backdrop-blur-sm transition duration-250 ease-out group-hover:scale-105 group-hover:opacity-100 group-focus-visible:opacity-100">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className={`h-7 w-7 ${isPlaybackVisuallyActive ? "" : "translate-x-[0.5px]"}`}
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
        ) : null}
      </span>
    </button>
  );
}
