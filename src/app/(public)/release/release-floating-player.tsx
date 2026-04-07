"use client";

import { Howler } from "howler";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

import { useReleaseAudioPlayer } from "@/app/(public)/release/release-audio-player";

function formatClockTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "0:00";
  }

  const safeSeconds = Math.floor(seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

type ReleaseFloatingPlayerProps = {
  coverSrc: string;
  fallbackArtistName: string;
};

type AutoScrollTextProps = {
  text: string;
  className: string;
  speedPxPerSecond?: number;
  returnSpeedPxPerSecond?: number;
  pauseAtStartMs?: number;
  pauseAtEndMs?: number;
};

function AutoScrollText({
  text,
  className,
  speedPxPerSecond = 22,
  returnSpeedPxPerSecond = 170,
  pauseAtStartMs = 5_000,
  pauseAtEndMs = 1_600,
}: AutoScrollTextProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLSpanElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [marqueeDistance, setMarqueeDistance] = useState(0);

  useEffect(() => {
    const containerElement = containerRef.current;
    const measureElement = measureRef.current;
    if (!containerElement || !measureElement) {
      return;
    }

    const updateOverflowState = () => {
      const containerWidth = containerElement.clientWidth;
      const textWidth = measureElement.getBoundingClientRect().width;
      const overflowWidth = textWidth - containerWidth;

      if (overflowWidth <= 1) {
        setMarqueeDistance(0);
        return;
      }

      setMarqueeDistance(overflowWidth);
    };

    updateOverflowState();
    const animationFrameId = window.requestAnimationFrame(updateOverflowState);
    const timeoutId = window.setTimeout(updateOverflowState, 180);
    if (typeof document !== "undefined" && "fonts" in document) {
      void (document as Document & { fonts?: FontFaceSet }).fonts?.ready.then(updateOverflowState);
    }

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateOverflowState);
      return () => {
        window.cancelAnimationFrame(animationFrameId);
        window.clearTimeout(timeoutId);
        window.removeEventListener("resize", updateOverflowState);
      };
    }

    const resizeObserver = new ResizeObserver(updateOverflowState);
    resizeObserver.observe(containerElement);
    resizeObserver.observe(measureElement);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.clearTimeout(timeoutId);
      resizeObserver.disconnect();
    };
  }, [text]);

  const shouldMarquee = marqueeDistance > 0;
  const forwardDurationMs = Math.max(3_200, (marqueeDistance / speedPxPerSecond) * 1_000);
  const returnDurationMs = Math.max(550, (marqueeDistance / returnSpeedPxPerSecond) * 1_000);
  const cycleDurationMs =
    pauseAtStartMs + forwardDurationMs + pauseAtEndMs + returnDurationMs;

  useEffect(() => {
    const trackElement = trackRef.current;
    if (!trackElement) {
      return;
    }

    if (!shouldMarquee) {
      trackElement.style.transform = "translate3d(0, 0, 0)";
      return;
    }

    if (
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      trackElement.style.transform = "translate3d(0, 0, 0)";
      return;
    }

    let animationFrameId = 0;
    const startedAtMs = window.performance.now();

    const tick = (nowMs: number) => {
      const elapsedMs = (nowMs - startedAtMs) % cycleDurationMs;
      let offsetX = 0;

      if (elapsedMs <= pauseAtStartMs) {
        offsetX = 0;
      } else if (elapsedMs <= pauseAtStartMs + forwardDurationMs) {
        const progress = (elapsedMs - pauseAtStartMs) / forwardDurationMs;
        offsetX = -marqueeDistance * progress;
      } else if (elapsedMs <= pauseAtStartMs + forwardDurationMs + pauseAtEndMs) {
        offsetX = -marqueeDistance;
      } else {
        const progress =
          (elapsedMs - pauseAtStartMs - forwardDurationMs - pauseAtEndMs) /
          returnDurationMs;
        offsetX = -marqueeDistance * (1 - progress);
      }

      trackElement.style.transform = `translate3d(${offsetX}px, 0, 0)`;
      animationFrameId = window.requestAnimationFrame(tick);
    };

    animationFrameId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(animationFrameId);
      trackElement.style.transform = "translate3d(0, 0, 0)";
    };
  }, [
    cycleDurationMs,
    forwardDurationMs,
    marqueeDistance,
    pauseAtEndMs,
    pauseAtStartMs,
    returnDurationMs,
    shouldMarquee,
  ]);

  return (
    <div ref={containerRef} className="relative min-w-0 overflow-hidden">
      <span
        ref={measureRef}
        aria-hidden="true"
        className={`pointer-events-none absolute left-0 top-0 -z-10 whitespace-nowrap opacity-0 ${className}`}
      >
        {text}
      </span>
      <div
        ref={trackRef}
        className={`${shouldMarquee ? "release-marquee-track flex w-max items-center" : "w-full"}`}
      >
        <span
          className={`${shouldMarquee ? "shrink-0 whitespace-nowrap" : "block truncate"} ${className}`}
        >
          {text}
        </span>
      </div>
    </div>
  );
}

export default function ReleaseFloatingPlayer({
  coverSrc,
  fallbackArtistName,
}: ReleaseFloatingPlayerProps) {
  const {
    tracks,
    activeTrackId,
    activeTrack,
    hasPlayableTracks,
    hasPlaybackStarted,
    isPlaying,
    isPlaybackVisuallyActive,
    currentTimeSeconds,
    durationSeconds,
    playTrack,
    toggleActiveTrackPlayback,
    seekToFraction,
    beginVisualPlaybackHold,
    endVisualPlaybackHold,
  } = useReleaseAudioPlayer();
  const [volumePercent, setVolumePercent] = useState(() => {
    const currentVolume = Howler.volume();
    if (!Number.isFinite(currentVolume)) {
      return 100;
    }

    return Math.round(Math.max(0, Math.min(1, currentVolume)) * 100);
  });
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubPercent, setScrubPercent] = useState(0);
  const isScrubbingRef = useRef(false);
  const scrubPercentRef = useRef(0);
  const resumeAfterScrubRef = useRef(false);

  const playableTracks = useMemo(
    () => tracks.filter((track) => track.isPlayablePreview),
    [tracks],
  );
  const activeTrackIndex = playableTracks.findIndex((track) => track.id === activeTrackId);
  const hasPreviousTrack = activeTrackIndex > 0;
  const hasNextTrack = activeTrackIndex >= 0 && activeTrackIndex < playableTracks.length - 1;

  const fallbackDurationSeconds =
    activeTrack?.durationMs && activeTrack.durationMs > 0 ? activeTrack.durationMs / 1000 : 0;
  const resolvedDurationSeconds =
    durationSeconds > 0 ? durationSeconds : fallbackDurationSeconds;
  const progressPercent =
    resolvedDurationSeconds > 0
      ? Math.min(100, Math.max(0, (currentTimeSeconds / resolvedDurationSeconds) * 100))
      : 0;
  const displayedProgressPercent = isScrubbing ? scrubPercent : progressPercent;
  const displayedCurrentTimeSeconds =
    isScrubbing && resolvedDurationSeconds > 0
      ? (scrubPercent / 100) * resolvedDurationSeconds
      : currentTimeSeconds;
  const playbackButtonLabel = isPlaybackVisuallyActive ? "Pause" : "Play";
  const progressRangeStyle = {
    "--range-progress": `${displayedProgressPercent}%`,
  } as CSSProperties;
  const volumeRangeStyle = {
    "--range-progress": `${volumePercent}%`,
  } as CSSProperties;
  const volumeIconLevel =
    volumePercent <= 0
      ? "mute"
      : volumePercent <= 33
        ? "low"
        : volumePercent <= 66
          ? "medium"
          : "high";

  function onPreviousTrack() {
    if (!hasPreviousTrack) {
      return;
    }

    const previousTrack = playableTracks[activeTrackIndex - 1];
    if (!previousTrack) {
      return;
    }

    playTrack(previousTrack.id);
  }

  function onNextTrack() {
    if (!hasNextTrack) {
      return;
    }

    const nextTrack = playableTracks[activeTrackIndex + 1];
    if (!nextTrack) {
      return;
    }

    playTrack(nextTrack.id);
  }

  function onProgressInput(rawValue: number) {
    if (!Number.isFinite(rawValue)) {
      return;
    }

    const clampedPercent = Math.max(0, Math.min(100, rawValue));
    if (isScrubbing) {
      setScrubPercent(clampedPercent);
      scrubPercentRef.current = clampedPercent;
      return;
    }

    seekToFraction(clampedPercent / 100);
  }

  const onScrubStart = useCallback(() => {
    if (isScrubbing) {
      return;
    }

    resumeAfterScrubRef.current = isPlaying;
    if (isPlaying) {
      beginVisualPlaybackHold();
    }
    isScrubbingRef.current = true;
    setIsScrubbing(true);
    setScrubPercent(progressPercent);
    scrubPercentRef.current = progressPercent;

    if (isPlaying) {
      // Pause once at drag start to avoid audible artifacts during repeated seeks.
      toggleActiveTrackPlayback();
    }
  }, [
    beginVisualPlaybackHold,
    isPlaying,
    isScrubbing,
    progressPercent,
    toggleActiveTrackPlayback,
  ]);

  const onScrubEnd = useCallback(() => {
    if (!isScrubbingRef.current) {
      return;
    }

    isScrubbingRef.current = false;
    const finalPercent = Math.max(0, Math.min(100, scrubPercentRef.current));
    setIsScrubbing(false);
    seekToFraction(finalPercent / 100);

    if (resumeAfterScrubRef.current) {
      resumeAfterScrubRef.current = false;
      window.setTimeout(() => {
        toggleActiveTrackPlayback();
        window.setTimeout(() => {
          endVisualPlaybackHold();
        }, 450);
      }, 0);
      return;
    }

    endVisualPlaybackHold();
  }, [endVisualPlaybackHold, seekToFraction, toggleActiveTrackPlayback]);

  useEffect(() => {
    if (!isScrubbing) {
      return;
    }

    const endScrub = () => onScrubEnd();
    window.addEventListener("pointerup", endScrub);
    window.addEventListener("pointercancel", endScrub);
    window.addEventListener("mouseup", endScrub);
    window.addEventListener("touchend", endScrub);

    return () => {
      window.removeEventListener("pointerup", endScrub);
      window.removeEventListener("pointercancel", endScrub);
      window.removeEventListener("mouseup", endScrub);
      window.removeEventListener("touchend", endScrub);
    };
  }, [isScrubbing, onScrubEnd]);

  useEffect(() => {
    return () => {
      endVisualPlaybackHold();
    };
  }, [endVisualPlaybackHold]);

  if (!hasPlayableTracks) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-3 sm:px-4 sm:pb-4">
      <div
        aria-hidden={!hasPlaybackStarted}
        className={`mx-auto w-full max-w-6xl rounded-2xl border border-zinc-200 bg-white/95 px-3 py-2.5 shadow-2xl backdrop-blur transition-all duration-300 ease-out sm:px-4 sm:py-3 ${
          hasPlaybackStarted
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none translate-y-6 opacity-0"
        }`}
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-5">
          <div className="flex min-w-0 items-center gap-3 md:w-[16rem] lg:w-[18rem]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={coverSrc}
              alt=""
              className="h-14 w-14 shrink-0 rounded-lg border border-zinc-200 object-cover"
            />
            <div className="min-w-0">
              <AutoScrollText
                text={activeTrack?.title ?? "No preview track selected"}
                className="text-[1.05rem] font-semibold text-zinc-900"
              />
              <AutoScrollText
                text={activeTrack?.artistName ?? fallbackArtistName}
                className="text-zinc-600"
                speedPxPerSecond={20}
              />
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={onPreviousTrack}
                disabled={!hasPreviousTrack}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Previous track"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-[1.35rem] w-[1.35rem]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M6.5 6v12M17.5 6 9.5 12l8 6V6Z" />
                </svg>
              </button>

              <button
                type="button"
                onClick={toggleActiveTrackPlayback}
                className="inline-flex h-[2.8rem] w-[2.8rem] items-center justify-center rounded-full bg-[var(--release-accent)] text-[var(--release-accent-contrast)] transition hover:bg-[var(--release-accent-hover)]"
                aria-label={playbackButtonLabel}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className={`h-7 w-7 ${isPlaybackVisuallyActive ? "" : "translate-x-[0.5px]"}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.85"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {isPlaybackVisuallyActive ? (
                    <path d="M9 6v12M15 6v12" />
                  ) : (
                    <path d="M8 6.5v11l9-5.5-9-5.5Z" />
                  )}
                </svg>
              </button>

              <button
                type="button"
                onClick={onNextTrack}
                disabled={!hasNextTrack}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Next track"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-[1.35rem] w-[1.35rem]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M17.5 6v12M6.5 6l8 6-8 6V6Z" />
                </svg>
              </button>
            </div>

            <div className="mt-1.5 flex items-center gap-2 text-[0.92rem] text-zinc-500">
              <span className="w-10 text-right tabular-nums tracking-tight">
                {formatClockTime(displayedCurrentTimeSeconds)}
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={displayedProgressPercent}
                style={progressRangeStyle}
                onInput={(event) => {
                  onProgressInput(Number((event.target as HTMLInputElement).value));
                }}
                onChange={(event) => {
                  onProgressInput(Number(event.target.value));
                }}
                onPointerDown={onScrubStart}
                onPointerUp={onScrubEnd}
                onPointerCancel={onScrubEnd}
                onBlur={onScrubEnd}
                disabled={resolvedDurationSeconds <= 0}
                className="release-player-range h-1.5 w-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Preview playback progress"
              />
              <span className="w-10 text-left tabular-nums tracking-tight">
                {formatClockTime(resolvedDurationSeconds)}
              </span>
            </div>
          </div>

          <div className="hidden items-center justify-center gap-2 md:flex md:w-[16rem] lg:w-[18rem]">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-6 w-6 shrink-0 stroke-zinc-600"
              fill="none"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 14h3l4 3V7l-4 3H4v4Z" />
              {volumeIconLevel === "mute" ? null : volumeIconLevel === "low" ? (
                <path d="M15 10.5a3 3 0 0 1 0 3" />
              ) : volumeIconLevel === "medium" ? (
                <>
                  <path d="M15 10.5a3 3 0 0 1 0 3" />
                  <path d="M17.5 9a5.5 5.5 0 0 1 0 6" />
                </>
              ) : (
                <>
                  <path d="M15 10.5a3 3 0 0 1 0 3" />
                  <path d="M17.5 9a5.5 5.5 0 0 1 0 6" />
                  <path d="M20 7.5a7.5 7.5 0 0 1 0 9" />
                </>
              )}
            </svg>
            <input
              type="range"
              min={0}
              max={100}
              value={volumePercent}
              style={volumeRangeStyle}
              onChange={(event) => {
                const nextVolume = Number(event.target.value);
                if (!Number.isFinite(nextVolume)) {
                  return;
                }
                const clamped = Math.max(0, Math.min(100, nextVolume));
                setVolumePercent(clamped);
                Howler.volume(clamped / 100);
              }}
              className="release-player-range hidden h-1.5 w-28 cursor-pointer sm:w-32 md:block"
              aria-label="Player volume"
            />
          </div>
        </div>
      </div>
      <style jsx>{`
        .release-player-range {
          -webkit-appearance: none;
          appearance: none;
          border: 0;
          border-radius: 9999px;
          background: linear-gradient(
            to right,
            var(--release-accent, #111827) 0%,
            var(--release-accent, #111827) var(--range-progress),
            var(--release-accent-soft, #e4e4e7) var(--range-progress),
            var(--release-accent-soft, #e4e4e7) 100%
          );
        }

        .release-player-range::-webkit-slider-runnable-track {
          height: 0.375rem;
          border-radius: 9999px;
          background: transparent;
        }

        .release-player-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          margin-top: -5px;
          height: 1rem;
          width: 1rem;
          border-radius: 9999px;
          border: 2px solid var(--release-accent, #111827);
          background: #fff;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
        }

        .release-player-range::-moz-range-track {
          height: 0.375rem;
          border: 0;
          border-radius: 9999px;
          background: var(--release-accent-soft, #e4e4e7);
        }

        .release-player-range::-moz-range-progress {
          height: 0.375rem;
          border-radius: 9999px;
          background: var(--release-accent, #111827);
        }

        .release-player-range::-moz-range-thumb {
          height: 1rem;
          width: 1rem;
          border-radius: 9999px;
          border: 2px solid var(--release-accent, #111827);
          background: #fff;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
        }

      `}</style>
      <style jsx global>{`
        .release-marquee-track {
          will-change: transform;
        }
      `}</style>
    </div>
  );
}
