"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { ReleaseRecord, TrackAssetRecord, TrackRecord } from "./types";
import { formatTrackDuration } from "./utils";

type PlaybackSourceMode =
  | "PREVIEW"
  | "DELIVERY_MP3"
  | "DELIVERY_M4A"
  | "DELIVERY_FLAC";

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

function pickSourceAsset(track: TrackRecord, mode: PlaybackSourceMode) {
  const sortedAssets = sortAssetsByUpdatedAtDesc(track.assets);
  const previewAsset = sortedAssets.find((asset) => asset.assetRole === "PREVIEW") ?? null;
  const masterAsset = sortedAssets.find((asset) => asset.assetRole === "MASTER") ?? null;
  const deliveryAssets = sortedAssets.filter((asset) => asset.assetRole === "DELIVERY");

  if (mode === "DELIVERY_MP3") {
    return (
      deliveryAssets.find(
        (asset) => normalizeDeliveryFormat(asset.format) === "MP3",
      ) ?? null
    );
  }

  if (mode === "DELIVERY_M4A") {
    return (
      deliveryAssets.find(
        (asset) => normalizeDeliveryFormat(asset.format) === "M4A",
      ) ?? null
    );
  }

  if (mode === "DELIVERY_FLAC") {
    return (
      deliveryAssets.find(
        (asset) => normalizeDeliveryFormat(asset.format) === "FLAC",
      ) ?? null
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
    return error.name === "AbortError";
  }

  if (error instanceof Error) {
    return error.name === "AbortError";
  }

  return false;
}

export function ReleaseManagementStorefrontPreview(props: {
  release: ReleaseRecord;
}) {
  const { release } = props;

  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [activeSourceAssetId, setActiveSourceAssetId] = useState<string | null>(null);
  const [playbackSource, setPlaybackSource] = useState<PlaybackSourceMode>("PREVIEW");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const activeTrack = useMemo(
    () => release.tracks.find((track) => track.id === activeTrackId) ?? null,
    [activeTrackId, release.tracks],
  );

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
            await audio.play();
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
      audio.currentTime = 0;
      setCurrentTime(0);
      setDuration(0);
      setActiveTrackId(track.id);
      setActiveSourceAssetId(sourceAsset.id);

      try {
        await audio.play();
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
    <section className="mt-4 rounded-lg border border-slate-700/80 bg-slate-900/50 p-3 text-xs text-zinc-400 sm:col-span-2">
      <p className="font-medium text-zinc-300">Storefront preview sandbox</p>
      <p className="mt-1">
        Quick playback check for generated clips/full-preview behavior on this release.
      </p>
      <label className="mt-3 flex max-w-xs flex-col gap-1 text-xs text-zinc-500">
        Playback source
        <select
          value={playbackSource}
          onChange={(event) => {
            const nextMode = event.target.value as PlaybackSourceMode;
            const audio = audioRef.current;
            if (audio) {
              audio.pause();
              audio.removeAttribute("src");
              audio.load();
            }
            setIsPlaying(false);
            setCurrentTime(0);
            setDuration(0);
            setActiveTrackId(null);
            setActiveSourceAssetId(null);
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
        <audio ref={audioRef} controls preload="metadata" className="mt-3 w-full" />
      </div>

      <div className="mt-3 space-y-2">
        {release.tracks.map((track) => {
          const sourceAsset = pickSourceAsset(track, playbackSource);
          const isActive = activeTrackId === track.id;
          const actionLabel = isActive ? (isPlaying ? "Pause" : "Resume") : "Play";

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
                  {formatTrackDuration(track.durationMs)} •{" "}
                  {track.previewMode === "FULL"
                    ? "full preview"
                    : `clip ${track.previewSeconds ?? 30}s`}{" "}
                  • selected source:{" "}
                  {sourceAsset ? getPlaybackSourceLabel(playbackSource).toLowerCase() : "none"}
                </p>
              </div>

              {sourceAsset ? (
                <button
                  type="button"
                  className="inline-flex items-center rounded-lg border border-sky-700/70 bg-sky-950/40 px-3 py-1.5 text-xs font-medium text-sky-200 transition hover:bg-sky-900/60"
                  onClick={() => void onTrackPlayToggle(track)}
                >
                  {actionLabel}
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
