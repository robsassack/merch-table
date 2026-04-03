"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { ReleaseRecord, TrackAssetRecord, TrackRecord } from "./types";

type PlaybackSourceMode =
  | "PREVIEW"
  | "DELIVERY_MP3"
  | "DELIVERY_M4A"
  | "DELIVERY_FLAC";
const DEFAULT_PLAYBACK_SOURCE: PlaybackSourceMode = "PREVIEW";

function sortAssetsByUpdatedAtDesc(assets: TrackAssetRecord[]) {
  return [...assets].sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

function normalizeDeliveryFormat(format: string) {
  const normalized = format.trim().toUpperCase();
  if (normalized === "MP3") {
    return "MP3";
  }

  if (normalized === "M4A" || normalized === "AAC" || normalized === "MP4") {
    return "M4A";
  }

  if (normalized === "FLAC") {
    return "FLAC";
  }

  return null;
}

function formatPlaybackFileName(storageKey: string) {
  const fileName = storageKey.split("/").filter(Boolean).at(-1) ?? storageKey;
  return fileName.length > 0 ? fileName : storageKey;
}

function getPlaybackSourceLabel(mode: PlaybackSourceMode) {
  if (mode === "PREVIEW") {
    return "Preview";
  }

  if (mode === "DELIVERY_MP3") {
    return "Delivery MP3";
  }

  if (mode === "DELIVERY_M4A") {
    return "Delivery M4A";
  }

  return "Delivery FLAC";
}

function findFirstPlayableSelection(
  tracks: TrackRecord[],
  mode: PlaybackSourceMode,
) {
  for (const track of tracks) {
    const sourceAsset = pickSourceAsset(track, mode);
    if (sourceAsset) {
      return {
        trackId: track.id,
        sourceAssetId: sourceAsset.id,
      };
    }
  }

  return null;
}

function pickSourceAsset(track: TrackRecord, mode: PlaybackSourceMode) {
  const sortedAssets = sortAssetsByUpdatedAtDesc(track.assets);
  const previewAsset = sortedAssets.find((asset) => asset.assetRole === "PREVIEW") ?? null;
  const masterAsset = sortedAssets.find((asset) => asset.assetRole === "MASTER") ?? null;
  const deliveryAssets = sortedAssets.filter((asset) => asset.assetRole === "DELIVERY");
  const lossyMasterForFormat = (format: "MP3" | "M4A" | "FLAC") =>
    sortedAssets.find(
      (asset) =>
        asset.assetRole === "MASTER" &&
        !asset.isLossless &&
        normalizeDeliveryFormat(asset.format) === format,
    ) ?? null;

  if (mode === "DELIVERY_MP3") {
    return (
      deliveryAssets.find(
        (asset) => normalizeDeliveryFormat(asset.format) === "MP3",
      ) ??
      lossyMasterForFormat("MP3")
    );
  }

  if (mode === "DELIVERY_M4A") {
    return (
      deliveryAssets.find(
        (asset) => normalizeDeliveryFormat(asset.format) === "M4A",
      ) ??
      lossyMasterForFormat("M4A")
    );
  }

  if (mode === "DELIVERY_FLAC") {
    return (
      deliveryAssets.find(
        (asset) => normalizeDeliveryFormat(asset.format) === "FLAC",
      ) ??
      lossyMasterForFormat("FLAC")
    );
  }

  if (track.previewMode === "FULL") {
    return masterAsset ?? previewAsset;
  }

  return previewAsset;
}

function formatClockTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }

  const safeSeconds = Math.floor(seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;

  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function isAbortPlaybackError(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === "AbortError") {
      return true;
    }

    return error.message.includes("play() request was interrupted");
  }

  if (error instanceof Error) {
    if (error.name === "AbortError") {
      return true;
    }

    return error.message.includes("play() request was interrupted");
  }

  return false;
}

async function playAudioWithAbortRetry(audio: HTMLAudioElement) {
  try {
    await audio.play();
    return;
  } catch (error) {
    if (!isAbortPlaybackError(error)) {
      throw error;
    }
  }

  // Firefox can abort a play() call immediately after a src swap. Retry once
  // on the next tick while still in the same user-initiated action path.
  await new Promise<void>((resolve) => {
    window.setTimeout(() => resolve(), 0);
  });
  await audio.play();
}

export function ReleaseManagementStorefrontPreview(props: {
  release: ReleaseRecord;
}) {
  const { release } = props;

  const initialSelection = findFirstPlayableSelection(
    release.tracks,
    DEFAULT_PLAYBACK_SOURCE,
  );

  const [playbackSource, setPlaybackSource] = useState<PlaybackSourceMode>(
    DEFAULT_PLAYBACK_SOURCE,
  );
  const [activeTrackId, setActiveTrackId] = useState<string | null>(
    initialSelection?.trackId ?? null,
  );
  const [activeSourceAssetId, setActiveSourceAssetId] = useState<string | null>(
    initialSelection?.sourceAssetId ?? null,
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const activeTrack = useMemo(
    () => release.tracks.find((track) => track.id === activeTrackId) ?? null,
    [activeTrackId, release.tracks],
  );
  const hasSelectedSource = activeSourceAssetId !== null;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);
    const onLoadedMetadata = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    };
    const onTimeUpdate = () => {
      setCurrentTime(Number.isFinite(audio.currentTime) ? audio.currentTime : 0);
    };

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("timeupdate", onTimeUpdate);

    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("timeupdate", onTimeUpdate);
    };
  }, []);

  const onTrackPlayToggle = async (track: TrackRecord) => {
    try {
      const sourceAsset = pickSourceAsset(track, playbackSource);
      if (!sourceAsset) {
        return;
      }

      const audio = audioRef.current;
      if (!audio) {
        return;
      }

      if (activeTrackId === track.id && activeSourceAssetId === sourceAsset.id) {
        if (audio.paused) {
          try {
            await playAudioWithAbortRetry(audio);
          } catch (error) {
            if (!isAbortPlaybackError(error)) {
              setIsPlaying(false);
            }
          }
        } else {
          audio.pause();
        }
        return;
      }

      const nextSrc = `/api/admin/tracks/assets/${sourceAsset.id}/stream`;
      audio.pause();
      audio.src = nextSrc;
      audio.load();
      try {
        audio.currentTime = 0;
      } catch (error) {
        // Some browsers can reject currentTime seeks during a fresh src swap.
        // This is non-fatal for preview playback; keep going.
        if (!isAbortPlaybackError(error)) {
          setIsPlaying(false);
        }
      }
      setCurrentTime(0);
      setDuration(0);
      setActiveTrackId(track.id);
      setActiveSourceAssetId(sourceAsset.id);

      try {
        await playAudioWithAbortRetry(audio);
      } catch (error) {
        if (!isAbortPlaybackError(error)) {
          setIsPlaying(false);
        }
      }
    } catch (error) {
      if (!isAbortPlaybackError(error)) {
        setIsPlaying(false);
      }
    }
  };

  return (
    <section className="mt-4 rounded-lg border border-slate-700/80 bg-slate-900/50 p-3 text-xs text-zinc-400 md:col-span-2">
      <p className="font-medium text-zinc-300">Storefront preview sandbox</p>
      <p className="mt-1">
        Quick playback check for generated clips/full-preview behavior on this release.
      </p>
      <label className="mt-3 flex w-full max-w-sm flex-col gap-1 text-xs text-zinc-500">
        Playback source
        <select
          value={playbackSource}
          onChange={(event) => {
            const nextMode = event.target.value as PlaybackSourceMode;
            const nextSelection = findFirstPlayableSelection(release.tracks, nextMode);
            const audio = audioRef.current;
            if (audio) {
              audio.pause();
              if (nextSelection) {
                audio.src = `/api/admin/tracks/assets/${nextSelection.sourceAssetId}/stream`;
                try {
                  audio.currentTime = 0;
                } catch {}
              } else {
                audio.removeAttribute("src");
                audio.load();
              }
            }
            setIsPlaying(false);
            setCurrentTime(0);
            setDuration(0);
            setActiveTrackId(nextSelection?.trackId ?? null);
            setActiveSourceAssetId(nextSelection?.sourceAssetId ?? null);
            setPlaybackSource(nextMode);
          }}
          className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
        >
          <option value="PREVIEW">Preview</option>
          <option value="DELIVERY_MP3">Delivery MP3</option>
          <option value="DELIVERY_M4A">Delivery M4A</option>
          <option value="DELIVERY_FLAC">Delivery FLAC</option>
        </select>
      </label>

      <div className="mt-3 rounded-lg border border-slate-700 bg-slate-900/80 p-3">
        <p className="text-sm font-medium text-zinc-200">
          {activeTrack ? `${release.title} — ${activeTrack.title}` : "No track selected"}
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Source mode: {getPlaybackSourceLabel(playbackSource)}
        </p>
        <p className="mt-1 text-xs text-zinc-400">
          {formatClockTime(currentTime)} / {formatClockTime(duration)}
        </p>
        <audio
          ref={audioRef}
          src={
            activeSourceAssetId
              ? `/api/admin/tracks/assets/${activeSourceAssetId}/stream`
              : undefined
          }
          controls={hasSelectedSource}
          preload="metadata"
          className="mt-3 w-full"
        />
        {!hasSelectedSource ? (
          <p className="mt-2 text-xs text-zinc-500">
            Select a track below to enable player controls.
          </p>
        ) : null}
      </div>

      <div className="mt-3 space-y-2">
        {release.tracks.map((track) => {
          const sourceAsset = pickSourceAsset(track, playbackSource);
          const isActive = activeTrackId === track.id;
          const actionLabel = isActive ? (isPlaying ? "Pause" : "Resume") : "Play";
          const actionSymbol = isActive && isPlaying ? "⏸" : "▶";

          return (
            <div
              key={track.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-700/80 bg-slate-900/70 p-2"
            >
              <div>
                <p className="text-sm text-zinc-100">
                  {track.trackNumber}. {track.title}
                </p>
                <p className="text-xs text-zinc-500">
                  Release: {release.title}
                </p>
                <p className="text-xs text-zinc-500">
                  Playback source:{" "}
                  {sourceAsset ? getPlaybackSourceLabel(playbackSource).toLowerCase() : "none"}
                </p>
                <p className="text-xs text-zinc-500">
                  Playback file:{" "}
                  {sourceAsset
                    ? formatPlaybackFileName(sourceAsset.storageKey)
                    : "not available"}
                </p>
              </div>

              {sourceAsset ? (
                <button
                  type="button"
                  className="inline-flex items-center rounded-lg border border-sky-700/70 bg-sky-950/40 px-3 py-1.5 text-xs font-medium text-sky-200 transition hover:bg-sky-900/60"
                  aria-label={actionLabel}
                  title={actionLabel}
                  onClick={() => {
                    void onTrackPlayToggle(track).catch((error) => {
                      if (!isAbortPlaybackError(error)) {
                        setIsPlaying(false);
                      }
                    });
                  }}
                >
                  <span aria-hidden="true">{actionSymbol}</span>
                  <span className="sr-only">{actionLabel}</span>
                </button>
              ) : (
                <span className="rounded-lg border border-amber-700/70 bg-amber-950/50 px-3 py-1.5 text-xs font-medium text-amber-200">
                  Source not ready
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
