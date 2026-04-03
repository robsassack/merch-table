import { useState } from "react";

import { buttonClassName, dangerButtonClassName } from "./constants";
import type { ReleaseRecord } from "./types";
import type { ReleaseManagementController } from "./use-release-management-controller";
import {
  formatTrackDuration,
  getTrackDeliveryStatus,
  getTrackPreviewStatus,
  resolveUploadedFileNameFromStorageKey,
  sortTracks,
  toTrackDraft,
} from "./utils";

const trackMetaChipClassName =
  "inline-flex items-center rounded-full border border-slate-700/80 bg-slate-900/70 px-2.5 py-1 text-[11px] font-medium leading-none text-zinc-300";
const trackMetaMutedChipClassName =
  "inline-flex items-center rounded-full border border-slate-700/70 bg-slate-950/70 px-2.5 py-1 text-[11px] font-medium leading-none text-zinc-400";

function normalizeDeliveryAssetFormat(format: string) {
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

export function ReleaseManagementTrackList(props: {
  controller: ReleaseManagementController;
  release: ReleaseRecord;
  isPending: boolean;
  importTrackPending: boolean;
  previewApplyPending: boolean;
  reorderTrackPending: boolean;
  showFailedOnly: boolean;
  expandedTrackIdForRelease: string | null;
  draggingTrackIdForRelease: string | null;
  dragOverTrackIdForRelease: string | null;
}) {
  const [deliveryDownloadAssetIdByTrackId, setDeliveryDownloadAssetIdByTrackId] =
    useState<Record<string, string>>({});

  const {
    release,
    isPending,
    importTrackPending,
    previewApplyPending,
    reorderTrackPending,
    showFailedOnly,
    expandedTrackIdForRelease,
    draggingTrackIdForRelease,
    dragOverTrackIdForRelease,
  } = props;

  const {
    trackDraftsById,
    setTrackDraftsById,
    pendingTrackId,
    pendingTrackRequeueId,
    pendingTrackUploadId,
    trackUploadProgressById,
    trackUploadRoleById,
    setTrackUploadRoleById,
    setTrackDeleteDialog,
    setExpandedTrackIdByReleaseId,
    setDraggingTrackIdByReleaseId,
    setDragOverTrackIdByReleaseId,
    onReorderTrackDrop,
    onInlineTrackFileChange,
    onUpdateTrack,
    onRequeueTrackFailedTranscodes,
  } = props.controller;

  const visibleTracks = sortTracks(release.tracks).filter(
    (track) =>
      !showFailedOnly ||
      track.transcodeJobs.some((job) => job.status === "FAILED"),
  );
  const orderedTracks = sortTracks(release.tracks);
  const orderedTrackIndexById = new Map(
    orderedTracks.map((track, index) => [track.id, index] as const),
  );

  return (
                      <div className="mt-3 space-y-3">
                        {visibleTracks.length === 0 ? (
                          <p className="rounded-md border border-dashed border-slate-700/80 px-3 py-2 text-[11px] text-zinc-500">
                            No failed tracks match this filter.
                          </p>
                        ) : null}
                        {visibleTracks.map((track) => {
                          const trackDraft = trackDraftsById[track.id] ?? toTrackDraft(track);
                          const isTrackExpanded = expandedTrackIdForRelease === track.id;
                          const trackPending = pendingTrackId === track.id;
                          const trackRequeuePending = pendingTrackRequeueId === track.id;
                          const trackUploadPending = pendingTrackUploadId === track.id;
                          const isTrackDragging = draggingTrackIdForRelease === track.id;
                          const isTrackDragOver = dragOverTrackIdForRelease === track.id;
                          const trackOrderIndex = orderedTrackIndexById.get(track.id) ?? -1;
                          const moveUpTargetTrackId =
                            trackOrderIndex > 0 ? orderedTracks[trackOrderIndex - 1]?.id ?? null : null;
                          const moveDownTargetTrackId =
                            trackOrderIndex >= 0 && trackOrderIndex < orderedTracks.length - 1
                              ? orderedTracks[trackOrderIndex + 1]?.id ?? null
                              : null;
                          const trackActionPending = trackPending || trackRequeuePending;
                          const trackUploadProgress = trackUploadProgressById[track.id] ?? 0;
                          const trackUploadRole = trackUploadRoleById[track.id] ?? "MASTER";
                          const previewStatus = getTrackPreviewStatus(track);
                          const deliveryStatus = getTrackDeliveryStatus(
                            track,
                            release.deliveryFormats,
                          );
                          const masterCount = track.assets.filter(
                            (asset) => asset.assetRole === "MASTER",
                          ).length;
                          const deliveryCount = track.assets.filter(
                            (asset) => asset.assetRole === "DELIVERY",
                          ).length;
                          const previewCount = track.assets.filter(
                            (asset) => asset.assetRole === "PREVIEW",
                          ).length;
                          const latestMasterAsset = track.assets
                            .filter((asset) => asset.assetRole === "MASTER")
                            .sort(
                              (a, b) =>
                                new Date(b.updatedAt).getTime() -
                                new Date(a.updatedAt).getTime(),
                            )[0];
                          const enabledDeliveryFormats = new Set(
                            release.deliveryFormats.length > 0
                              ? release.deliveryFormats
                              : ["MP3", "M4A", "FLAC"],
                          );
                          const deliveryAssetsByFormat = new Map<string, (typeof track.assets)[number]>();
                          for (const asset of track.assets
                            .filter((entry) => entry.assetRole === "DELIVERY")
                            .sort(
                              (a, b) =>
                                new Date(b.updatedAt).getTime() -
                                new Date(a.updatedAt).getTime(),
                            )) {
                            const formatLabel = normalizeDeliveryAssetFormat(asset.format);
                            if (
                              formatLabel &&
                              enabledDeliveryFormats.has(formatLabel) &&
                              !deliveryAssetsByFormat.has(formatLabel)
                            ) {
                              deliveryAssetsByFormat.set(formatLabel, asset);
                            }
                          }

                          for (const asset of track.assets
                            .filter((entry) => entry.assetRole === "MASTER" && !entry.isLossless)
                            .sort(
                              (a, b) =>
                                new Date(b.updatedAt).getTime() -
                                new Date(a.updatedAt).getTime(),
                            )) {
                            const formatLabel = normalizeDeliveryAssetFormat(asset.format);
                            if (
                              formatLabel &&
                              enabledDeliveryFormats.has(formatLabel) &&
                              !deliveryAssetsByFormat.has(formatLabel)
                            ) {
                              // Use lossy master as delivery fallback for matching format.
                              deliveryAssetsByFormat.set(formatLabel, asset);
                            }
                          }

                          const deliveryDownloadOptions = Array.from(
                            deliveryAssetsByFormat.entries(),
                          ).map(([format, asset]) => ({
                            id: asset.id,
                            label: asset.assetRole === "MASTER" ? `${format} (master)` : format,
                          }));
                          const selectedDeliveryAssetId = (() => {
                            const selected = deliveryDownloadAssetIdByTrackId[track.id];
                            if (
                              selected &&
                              deliveryDownloadOptions.some((option) => option.id === selected)
                            ) {
                              return selected;
                            }
                            return deliveryDownloadOptions[0]?.id ?? "";
                          })();
                          const masterDownloadAssetId = latestMasterAsset?.id ?? "";
                          const deliveryDownloadAssetId = selectedDeliveryAssetId;
                          const deliveryFallbackCount = Array.from(
                            deliveryAssetsByFormat.values(),
                          ).filter((asset) => asset.assetRole === "MASTER").length;
                          const deliveryCountLabel =
                            deliveryCount > 0 || deliveryFallbackCount > 0
                              ? String(deliveryCount + deliveryFallbackCount)
                              : "n/a";
                          const uploadedMasterFileName = latestMasterAsset
                            ? resolveUploadedFileNameFromStorageKey(latestMasterAsset.storageKey)
                            : "";
                          const failedJobs = track.transcodeJobs.filter(
                            (job) => job.status === "FAILED",
                          );
                          const failedJobsCount = failedJobs.length;
                          const lastFailedJob = failedJobs
                            .sort(
                              (a, b) =>
                                new Date(b.updatedAt).getTime() -
                                new Date(a.updatedAt).getTime(),
                            )[0];

                          return (
                            <div
                              key={track.id}
                              className={`rounded-lg border bg-slate-950/60 p-3 transition-opacity ${
                                isTrackDragOver
                                  ? "border-emerald-500/70 bg-emerald-950/10"
                                  : "border-slate-700"
                              } ${
                                isTrackDragging
                                  ? "opacity-70"
                                  : "opacity-100"
                              }`}
                              onDragOver={(event) => {
                                if (!draggingTrackIdForRelease || reorderTrackPending) {
                                  return;
                                }
                                event.preventDefault();
                                event.dataTransfer.dropEffect = "move";
                                setDragOverTrackIdByReleaseId((previous) => ({
                                  ...previous,
                                  [release.id]: track.id,
                                }));
                              }}
                              onDrop={(event) => {
                                event.preventDefault();
                                void onReorderTrackDrop(release, track.id);
                              }}
                            >
                              <div className="flex flex-col gap-2 md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-3">
                                <div className="flex min-w-0 items-start gap-2 md:items-center md:gap-3">
                                  <span
                                    draggable={!reorderTrackPending}
                                    onDragStart={(event) => {
                                      if (reorderTrackPending) {
                                        return;
                                      }
                                      event.dataTransfer.effectAllowed = "move";
                                      event.dataTransfer.setData("text/plain", track.id);
                                      setDraggingTrackIdByReleaseId((previous) => ({
                                        ...previous,
                                        [release.id]: track.id,
                                      }));
                                    }}
                                    onDragEnd={() => {
                                      setDraggingTrackIdByReleaseId((previous) => ({
                                        ...previous,
                                        [release.id]: null,
                                      }));
                                      setDragOverTrackIdByReleaseId((previous) => ({
                                        ...previous,
                                        [release.id]: null,
                                      }));
                                    }}
                                    className={`hidden select-none rounded border px-1 py-0.5 text-[11px] md:inline-flex md:w-4 md:shrink-0 md:justify-center ${
                                      isTrackDragging
                                        ? "border-emerald-500/70 text-emerald-300"
                                        : "border-slate-600 text-zinc-400"
                                    } ${reorderTrackPending ? "cursor-not-allowed" : "cursor-grab"}`}
                                    aria-label={`Drag to reorder ${track.title}`}
                                    title="Drag to reorder"
                                  >
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      viewBox="0 0 12 14"
                                      className="h-3.5 w-3.5"
                                      fill="currentColor"
                                      aria-hidden="true"
                                    >
                                      <circle cx="3" cy="2" r="1" />
                                      <circle cx="9" cy="2" r="1" />
                                      <circle cx="3" cy="7" r="1" />
                                      <circle cx="9" cy="7" r="1" />
                                      <circle cx="3" cy="12" r="1" />
                                      <circle cx="9" cy="12" r="1" />
                                    </svg>
                                  </span>
                                  <p className="min-w-0 break-words text-left text-xs font-medium text-zinc-200">
                                    Track {track.trackNumber} • {track.title} •{" "}
                                    {formatTrackDuration(track.durationMs)}
                                  </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                                  <button
                                    type="button"
                                    className={`${buttonClassName} px-2 py-1.5 md:hidden`}
                                    aria-label={`Move ${track.title} up`}
                                    title="Move up"
                                    disabled={
                                      isPending ||
                                      trackActionPending ||
                                      importTrackPending ||
                                      previewApplyPending ||
                                      reorderTrackPending ||
                                      trackUploadPending ||
                                      moveUpTargetTrackId === null
                                    }
                                    onClick={() => {
                                      if (!moveUpTargetTrackId) {
                                        return;
                                      }
                                      void onReorderTrackDrop(release, moveUpTargetTrackId, {
                                        draggedTrackId: track.id,
                                      });
                                    }}
                                  >
                                    ↑
                                  </button>
                                  <button
                                    type="button"
                                    className={`${buttonClassName} px-2 py-1.5 md:hidden`}
                                    aria-label={`Move ${track.title} down`}
                                    title="Move down"
                                    disabled={
                                      isPending ||
                                      trackActionPending ||
                                      importTrackPending ||
                                      previewApplyPending ||
                                      reorderTrackPending ||
                                      trackUploadPending ||
                                      moveDownTargetTrackId === null
                                    }
                                    onClick={() => {
                                      if (!moveDownTargetTrackId) {
                                        return;
                                      }
                                      void onReorderTrackDrop(release, moveDownTargetTrackId, {
                                        draggedTrackId: track.id,
                                      });
                                    }}
                                  >
                                    ↓
                                  </button>
                                  <button
                                    type="button"
                                    className={`${dangerButtonClassName} px-2 py-1.5`}
                                    aria-label={trackPending ? "Deleting track" : "Delete track"}
                                    title={trackPending ? "Deleting..." : "Delete track"}
                                    disabled={
                                      isPending ||
                                      trackActionPending ||
                                      importTrackPending ||
                                      previewApplyPending ||
                                      reorderTrackPending ||
                                      trackUploadPending
                                    }
                                    onClick={() => {
                                      setTrackDeleteDialog({
                                        releaseId: release.id,
                                        releaseTitle: release.title,
                                        track,
                                      });
                                    }}
                                  >
                                    <span className="sr-only">
                                      {trackPending ? "Deleting..." : "Delete"}
                                    </span>
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      className="h-4 w-4"
                                      aria-hidden="true"
                                    >
                                      <path d="M3 6h18" />
                                      <path d="M8 6V4h8v2" />
                                      <path d="M19 6l-1 14H6L5 6" />
                                      <path d="M10 11v6" />
                                      <path d="M14 11v6" />
                                    </svg>
                                  </button>
                                  <button
                                    type="button"
                                    className={`${buttonClassName} px-2 py-1.5`}
                                    aria-label={
                                      isTrackExpanded ? "Hide track details" : "Show track details"
                                    }
                                    title={
                                      isTrackExpanded ? "Hide track details" : "Show track details"
                                    }
                                    disabled={
                                      isPending ||
                                      trackActionPending ||
                                      importTrackPending ||
                                      previewApplyPending ||
                                      reorderTrackPending ||
                                      trackUploadPending
                                    }
                                    onClick={() =>
                                      setExpandedTrackIdByReleaseId((previous) => ({
                                        ...previous,
                                        [release.id]: isTrackExpanded ? null : track.id,
                                      }))
                                    }
                                  >
                                    <span className="sr-only">
                                      {isTrackExpanded ? "Hide details" : "Show details"}
                                    </span>
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      className={`h-4 w-4 transition-transform ${
                                        isTrackExpanded ? "rotate-180" : ""
                                      }`}
                                      aria-hidden="true"
                                    >
                                      <path d="m6 9 6 6 6-6" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                              <div className="mt-3 flex flex-wrap items-center gap-2 md:mt-2 md:pl-7">
                                <span className={previewStatus.className}>
                                  {previewStatus.label}
                                </span>
                                <span className={deliveryStatus.className}>
                                  {deliveryStatus.label}
                                </span>
                                {failedJobsCount > 0 ? (
                                  <span className="inline-flex items-center rounded-full border border-rose-700/70 bg-rose-950/40 px-2.5 py-1 text-[11px] font-medium leading-none text-rose-300">
                                    {failedJobsCount} failed
                                  </span>
                                ) : null}
                                <span className={trackMetaMutedChipClassName}>
                                  assets: {masterCount} master, {deliveryCountLabel} delivery,{" "}
                                  {previewCount} preview
                                </span>
                                {uploadedMasterFileName ? (
                                  <span className={`${trackMetaChipClassName} min-w-0 max-w-full`}>
                                    <span className="text-zinc-400">uploaded:</span>
                                    <span className="ml-1 min-w-0 truncate font-medium text-zinc-200">
                                      {uploadedMasterFileName}
                                    </span>
                                  </span>
                                ) : null}
                              </div>

                              {isTrackExpanded ? (
                                <>
                                  <div className="mt-3 grid gap-3 md:grid-cols-6">
                                <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400 md:col-span-4">
                                  Title
                                  <input
                                    value={trackDraft.title}
                                    onChange={(event) =>
                                      setTrackDraftsById((previous) => ({
                                        ...previous,
                                        [track.id]: {
                                          ...trackDraft,
                                          title: event.target.value,
                                        },
                                      }))
                                    }
                                    className="rounded-lg border border-slate-500/80 bg-slate-900/80 px-2.5 py-2 text-sm text-zinc-100 shadow-inner outline-none transition focus:border-emerald-400/80 focus:ring-2 focus:ring-emerald-500/20"
                                    disabled={
                                      isPending ||
                                      trackActionPending ||
                                      importTrackPending ||
                                      previewApplyPending ||
                                      reorderTrackPending
                                    }
                                  />
                                </label>
                                <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400 md:col-span-2">
                                  Track Number
                                  <input
                                    value={trackDraft.trackNumber}
                                    onChange={(event) =>
                                      setTrackDraftsById((previous) => ({
                                        ...previous,
                                        [track.id]: {
                                          ...trackDraft,
                                          trackNumber: event.target.value,
                                        },
                                      }))
                                    }
                                    className="rounded-lg border border-slate-500/80 bg-slate-900/80 px-2.5 py-2 text-sm text-zinc-100 shadow-inner outline-none transition focus:border-emerald-400/80 focus:ring-2 focus:ring-emerald-500/20"
                                    inputMode="numeric"
                                    disabled={
                                      isPending ||
                                      trackActionPending ||
                                      importTrackPending ||
                                      previewApplyPending ||
                                      reorderTrackPending
                                    }
                                  />
                                </label>
                                <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400 md:col-span-3">
                                  Credits
                                  <textarea
                                    rows={3}
                                    value={trackDraft.credits}
                                    onChange={(event) =>
                                      setTrackDraftsById((previous) => ({
                                        ...previous,
                                        [track.id]: {
                                          ...trackDraft,
                                          credits: event.target.value,
                                        },
                                      }))
                                    }
                                    className="min-h-[88px] rounded-lg border border-slate-500/80 bg-slate-900/80 px-2.5 py-2 text-sm text-zinc-100 shadow-inner outline-none transition focus:border-emerald-400/80 focus:ring-2 focus:ring-emerald-500/20"
                                    disabled={
                                      isPending ||
                                      trackActionPending ||
                                      importTrackPending ||
                                      previewApplyPending ||
                                      reorderTrackPending
                                    }
                                  />
                                </label>
                                <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400 md:col-span-3">
                                  Lyrics
                                  <textarea
                                    rows={3}
                                    value={trackDraft.lyrics}
                                    onChange={(event) =>
                                      setTrackDraftsById((previous) => ({
                                        ...previous,
                                        [track.id]: {
                                          ...trackDraft,
                                          lyrics: event.target.value,
                                        },
                                      }))
                                    }
                                    className="min-h-[88px] rounded-lg border border-slate-500/80 bg-slate-900/80 px-2.5 py-2 text-sm text-zinc-100 shadow-inner outline-none transition focus:border-emerald-400/80 focus:ring-2 focus:ring-emerald-500/20"
                                    disabled={
                                      isPending ||
                                      trackActionPending ||
                                      importTrackPending ||
                                      previewApplyPending ||
                                      reorderTrackPending
                                    }
                                  />
                                </label>
                                  </div>

                                  <div className="mt-3 flex flex-wrap items-center gap-2">
                                <select
                                  value={trackUploadRole}
                                  onChange={(event) =>
                                    setTrackUploadRoleById((previous) => ({
                                      ...previous,
                                      [track.id]: event.target.value as "MASTER" | "DELIVERY",
                                    }))
                                  }
                                  disabled={
                                    isPending ||
                                    trackActionPending ||
                                    importTrackPending ||
                                    previewApplyPending ||
                                    reorderTrackPending ||
                                    trackUploadPending
                                  }
                                  className="rounded-md border border-slate-600 bg-slate-950 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-slate-400 disabled:opacity-50"
                                  aria-label={`Asset role for ${track.title}`}
                                >
                                  <option value="MASTER">Master</option>
                                  <option value="DELIVERY">Delivery</option>
                                </select>
                                <label className={buttonClassName}>
                                  <input
                                    type="file"
                                    accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/wave,audio/flac,audio/x-flac,audio/aac,audio/mp4,audio/x-m4a,audio/ogg,audio/webm,audio/aiff,audio/x-aiff"
                                    className="hidden"
                                    onChange={(event) =>
                                      void onInlineTrackFileChange(release.id, track, event)
                                    }
                                    disabled={
                                      isPending ||
                                      trackActionPending ||
                                      importTrackPending ||
                                      previewApplyPending ||
                                      reorderTrackPending ||
                                      trackUploadPending
                                    }
                                  />
                                  {trackUploadPending
                                    ? `Uploading ${trackUploadProgress}%`
                                    : `Upload ${trackUploadRole === "MASTER" ? "Master" : "Delivery"}`}
                                </label>
                                {trackUploadRole === "DELIVERY" &&
                                deliveryDownloadOptions.length > 1 ? (
                                  <select
                                    value={deliveryDownloadAssetId}
                                    onChange={(event) =>
                                      setDeliveryDownloadAssetIdByTrackId((previous) => ({
                                        ...previous,
                                        [track.id]: event.target.value,
                                      }))
                                    }
                                    className="rounded-md border border-slate-600 bg-slate-950 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-slate-400"
                                    aria-label={`Delivery format download for ${track.title}`}
                                  >
                                    {deliveryDownloadOptions.map((option) => (
                                      <option key={option.id} value={option.id}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>
                                ) : null}
                                {trackUploadRole === "MASTER" && masterDownloadAssetId ? (
                                  <a
                                    href={`/api/admin/tracks/assets/${masterDownloadAssetId}/download`}
                                    className={buttonClassName}
                                  >
                                    Download Master
                                  </a>
                                ) : null}
                                {trackUploadRole === "MASTER" && !masterDownloadAssetId ? (
                                  <span
                                    className={`${buttonClassName} cursor-not-allowed opacity-50`}
                                    aria-disabled="true"
                                  >
                                    No Master
                                  </span>
                                ) : null}
                                {trackUploadRole === "DELIVERY" && deliveryDownloadAssetId ? (
                                  <a
                                    href={`/api/admin/tracks/assets/${deliveryDownloadAssetId}/download`}
                                    className={buttonClassName}
                                  >
                                    Download Delivery
                                  </a>
                                ) : null}
                                {trackUploadRole === "DELIVERY" && !deliveryDownloadAssetId ? (
                                  <span
                                    className={`${buttonClassName} cursor-not-allowed opacity-50`}
                                    aria-disabled="true"
                                  >
                                    No Delivery
                                  </span>
                                ) : null}
                                {failedJobsCount > 0 ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void onRequeueTrackFailedTranscodes(release.id, track)
                                    }
                                    disabled={
                                      isPending ||
                                      trackActionPending ||
                                      importTrackPending ||
                                      previewApplyPending ||
                                      reorderTrackPending ||
                                      trackUploadPending
                                    }
                                    className={buttonClassName}
                                  >
                                    {trackRequeuePending
                                      ? "Queueing..."
                                      : `Requeue Failed (${failedJobsCount})`}
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => void onUpdateTrack(release.id, track.id)}
                                  disabled={
                                    isPending ||
                                    trackActionPending ||
                                    importTrackPending ||
                                    previewApplyPending ||
                                    reorderTrackPending ||
                                    trackUploadPending
                                  }
                                  className={buttonClassName}
                                >
                                  {trackPending ? "Saving..." : "Save Track"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setTrackDeleteDialog({
                                      releaseId: release.id,
                                      releaseTitle: release.title,
                                      track,
                                    });
                                  }}
                                  disabled={
                                    isPending ||
                                    trackActionPending ||
                                    importTrackPending ||
                                    previewApplyPending ||
                                    reorderTrackPending ||
                                    trackUploadPending
                                  }
                                  className={dangerButtonClassName}
                                >
                                  {trackPending ? "Deleting..." : "Delete Track"}
                                </button>
                                  </div>

                                  {lastFailedJob?.errorMessage ? (
                                    <p className="mt-2 rounded-md border border-rose-700/60 bg-rose-950/40 px-2 py-1 text-[11px] text-rose-200">
                                      Last {lastFailedJob.jobKind === "PREVIEW_CLIP" ? "preview" : "delivery"} error: {lastFailedJob.errorMessage}
                                    </p>
                                  ) : null}
                                </>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
  );
}
