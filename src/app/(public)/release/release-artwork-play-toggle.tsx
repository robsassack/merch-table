"use client";

import Image from "next/image";
import { useReleaseAudioPlayer } from "@/app/(public)/release/release-audio-player";
import { IMAGE_BLUR_DATA_URL } from "@/lib/ui/image-blur";

type ReleaseArtworkPlayToggleProps = {
  coverSrc: string;
  releaseTitle: string;
  previewTrackId: string | null;
  playablePreviewTrackIds: string[];
};

export default function ReleaseArtworkPlayToggle({
  coverSrc,
  releaseTitle,
  previewTrackId,
  playablePreviewTrackIds,
}: ReleaseArtworkPlayToggleProps) {
  const { activeTrackId, isPlaybackVisuallyActive, playTrack } =
    useReleaseAudioPlayer();
  const hasPreviewTrack = previewTrackId !== null;
  const isCurrentReleaseTrackActive = Boolean(
    activeTrackId && playablePreviewTrackIds.includes(activeTrackId),
  );
  const artworkAriaLabel = hasPreviewTrack
    ? `${isCurrentReleaseTrackActive && isPlaybackVisuallyActive ? "Pause" : "Play"} preview`
    : "Preview unavailable";

  return (
    <button
      type="button"
      disabled={!hasPreviewTrack}
      onClick={() => {
        if (!hasPreviewTrack) {
          return;
        }

        if (activeTrackId && playablePreviewTrackIds.includes(activeTrackId)) {
          playTrack(activeTrackId);
          return;
        }

        if (previewTrackId) {
          playTrack(previewTrackId);
        }
      }}
      aria-label={artworkAriaLabel}
      className="group relative mx-auto aspect-square w-full max-w-[26rem] cursor-pointer overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--release-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-white lg:mx-0 disabled:cursor-default"
    >
      <Image
        src={coverSrc}
        alt={`${releaseTitle} cover`}
        fill
        sizes="(max-width: 1024px) 100vw, 26rem"
        priority
        placeholder="blur"
        blurDataURL={IMAGE_BLUR_DATA_URL}
        className={`h-full w-full object-cover transition duration-300 ease-out ${
          hasPreviewTrack ? "group-hover:scale-[1.035] group-hover:blur-[1.1px]" : ""
        }`}
      />

      <span aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
        {hasPreviewTrack ? (
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/88 text-zinc-900 opacity-0 backdrop-blur-sm transition duration-250 ease-out group-hover:scale-105 group-hover:opacity-100 group-focus-visible:opacity-100">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className={`h-7 w-7 ${isCurrentReleaseTrackActive && isPlaybackVisuallyActive ? "" : "translate-x-[0.5px]"}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {isCurrentReleaseTrackActive && isPlaybackVisuallyActive ? (
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
