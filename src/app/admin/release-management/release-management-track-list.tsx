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
    expandedTrackIdForRelease,
    draggingTrackIdForRelease,
    dragOverTrackIdForRelease,
  } = props;

  const {
    trackDraftsById,
    setTrackDraftsById,
    pendingTrackId,
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
  } = props.controller;

  return (
                      <div className="mt-3 space-y-3">
                        {sortTracks(release.tracks).map((track) => {
                          const trackDraft = trackDraftsById[track.id] ?? toTrackDraft(track);
                          const isTrackExpanded = expandedTrackIdForRelease === track.id;
                          const trackPending = pendingTrackId === track.id;
                          const trackUploadPending = pendingTrackUploadId === track.id;
                          const isTrackDragging = draggingTrackIdForRelease === track.id;
                          const isTrackDragOver = dragOverTrackIdForRelease === track.id;
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
                          const lastFailedJob = track.transcodeJobs
                            .filter(
                              (job) =>
                                job.jobKind === "PREVIEW_CLIP" && job.status === "FAILED",
                            )
                            .sort(
                              (a, b) =>
                                new Date(b.updatedAt).getTime() -
                                new Date(a.updatedAt).getTime(),
                            )[0];

                          return (
                            <div
                              key={track.id}
                              className={`rounded-lg border bg-slate-950/60 p-3 ${
                                isTrackDragOver
                                  ? "border-emerald-500/70"
                                  : "border-slate-700"
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
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
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
                                    className={`select-none rounded border px-1 py-0 text-[11px] ${
                                      isTrackDragging
                                        ? "border-emerald-500/70 text-emerald-300"
                                        : "border-slate-600 text-zinc-400"
                                    } ${reorderTrackPending ? "cursor-not-allowed" : "cursor-grab"}`}
                                    aria-label={`Drag to reorder ${track.title}`}
                                    title="Drag to reorder"
                                  >
                                    ||
                                  </span>
                                  <p className="text-left text-xs font-medium text-zinc-200">
                                    Track {track.trackNumber} • {track.title} •{" "}
                                    {formatTrackDuration(track.durationMs)}
                                  </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    className={`${dangerButtonClassName} px-2 py-1.5`}
                                    aria-label={trackPending ? "Deleting track" : "Delete track"}
                                    title={trackPending ? "Deleting..." : "Delete track"}
                                    disabled={
                                      isPending ||
                                      trackPending ||
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
                                      trackPending ||
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
                              <div className="mt-1 flex flex-wrap items-center gap-2 pl-6">
                                <span className={previewStatus.className}>
                                  {previewStatus.label}
                                </span>
                                <span className={deliveryStatus.className}>
                                  {deliveryStatus.label}
                                </span>
                                <span className="text-[11px] text-zinc-500">
                                  assets: {masterCount} master, {deliveryCountLabel} delivery,{" "}
                                  {previewCount} preview
                                </span>
                                {uploadedMasterFileName ? (
                                  <span className="max-w-full truncate text-[11px] text-zinc-500">
                                    uploaded:{" "}
                                    <span className="font-medium text-zinc-300">
                                      {uploadedMasterFileName}
                                    </span>
                                  </span>
                                ) : null}
                              </div>

                              {isTrackExpanded ? (
                                <>
                                  <div className="mt-3 grid gap-3 sm:grid-cols-6">
                                <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400 sm:col-span-4">
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
                                      trackPending ||
                                      importTrackPending ||
                                      previewApplyPending ||
                                      reorderTrackPending
                                    }
                                  />
                                </label>
                                <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400 sm:col-span-2">
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
                                      trackPending ||
                                      importTrackPending ||
                                      previewApplyPending ||
                                      reorderTrackPending
                                    }
                                  />
                                </label>
                                <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400 sm:col-span-3">
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
                                      trackPending ||
                                      importTrackPending ||
                                      previewApplyPending ||
                                      reorderTrackPending
                                    }
                                  />
                                </label>
                                <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400 sm:col-span-3">
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
                                      trackPending ||
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
                                    trackPending ||
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
                                      trackPending ||
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
                                <button
                                  type="button"
                                  onClick={() => void onUpdateTrack(release.id, track.id)}
                                  disabled={
                                    isPending ||
                                    trackPending ||
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
                                    trackPending ||
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
                                      Last preview error: {lastFailedJob.errorMessage}
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
