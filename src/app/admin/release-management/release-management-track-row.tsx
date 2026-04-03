import { useMemo } from "react";

import { buttonClassName, dangerButtonClassName } from "./constants";
import { ReleaseManagementTrackRowDetails } from "./release-management-track-row-details";
import type { ReleaseRecord, TrackAssetRecord, TrackRecord } from "./types";
import type { ReleaseManagementController } from "./use-release-management-controller";
import {
  formatTrackDuration,
  getTrackDeliveryStatus,
  getTrackPreviewStatus,
  resolveUploadedFileNameFromStorageKey,
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

type ReleaseManagementTrackRowProps = {
  controller: ReleaseManagementController;
  release: ReleaseRecord;
  track: TrackRecord;
  isPending: boolean;
  importTrackPending: boolean;
  previewApplyPending: boolean;
  reorderTrackPending: boolean;
  isTrackExpanded: boolean;
  isTrackDragging: boolean;
  isTrackDragOver: boolean;
  moveUpTargetTrackId: string | null;
  moveDownTargetTrackId: string | null;
  deliveryDownloadAssetId: string;
  setDeliveryDownloadAssetId: (assetId: string) => void;
};

export function ReleaseManagementTrackRow(props: ReleaseManagementTrackRowProps) {
  const {
    controller,
    release,
    track,
    isPending,
    importTrackPending,
    previewApplyPending,
    reorderTrackPending,
    isTrackExpanded,
    isTrackDragging,
    isTrackDragOver,
    moveUpTargetTrackId,
    moveDownTargetTrackId,
    deliveryDownloadAssetId,
    setDeliveryDownloadAssetId,
  } = props;

  const trackDraft = controller.trackDraftsById[track.id] ?? toTrackDraft(track);
  const trackPending = controller.pendingTrackId === track.id;
  const trackRequeuePending = controller.pendingTrackRequeueId === track.id;
  const trackUploadPending = controller.pendingTrackUploadId === track.id;
  const trackActionPending = trackPending || trackRequeuePending;
  const trackUploadProgress = controller.trackUploadProgressById[track.id] ?? 0;
  const trackUploadRole = controller.trackUploadRoleById[track.id] ?? "MASTER";

  const previewStatus = getTrackPreviewStatus(track);
  const deliveryStatus = getTrackDeliveryStatus(track, release.deliveryFormats);

  const { masterCount, deliveryCount, previewCount, latestMasterAsset, deliveryAssetsByFormat } =
    useMemo(() => {
      const masterAssets = track.assets.filter((asset) => asset.assetRole === "MASTER");
      const deliveryAssets = track.assets.filter((asset) => asset.assetRole === "DELIVERY");
      const previewAssets = track.assets.filter((asset) => asset.assetRole === "PREVIEW");

      const latestMaster = [...masterAssets].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )[0];

      const enabledDeliveryFormats = new Set(
        release.deliveryFormats.length > 0 ? release.deliveryFormats : ["MP3", "M4A", "FLAC"],
      );
      const byFormat = new Map<string, TrackAssetRecord>();

      for (const asset of [...deliveryAssets].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )) {
        const formatLabel = normalizeDeliveryAssetFormat(asset.format);
        if (formatLabel && enabledDeliveryFormats.has(formatLabel) && !byFormat.has(formatLabel)) {
          byFormat.set(formatLabel, asset);
        }
      }

      for (const asset of [...masterAssets]
        .filter((entry) => !entry.isLossless)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())) {
        const formatLabel = normalizeDeliveryAssetFormat(asset.format);
        if (formatLabel && enabledDeliveryFormats.has(formatLabel) && !byFormat.has(formatLabel)) {
          byFormat.set(formatLabel, asset);
        }
      }

      return {
        masterCount: masterAssets.length,
        deliveryCount: deliveryAssets.length,
        previewCount: previewAssets.length,
        latestMasterAsset: latestMaster,
        deliveryAssetsByFormat: byFormat,
      };
    }, [release.deliveryFormats, track.assets]);

  const deliveryDownloadOptions = Array.from(deliveryAssetsByFormat.entries()).map(
    ([format, asset]) => ({
      id: asset.id,
      label: asset.assetRole === "MASTER" ? `${format} (master)` : format,
    }),
  );

  const selectedDeliveryAssetId =
    deliveryDownloadAssetId &&
    deliveryDownloadOptions.some((option) => option.id === deliveryDownloadAssetId)
      ? deliveryDownloadAssetId
      : deliveryDownloadOptions[0]?.id ?? "";

  const masterDownloadAssetId = latestMasterAsset?.id ?? "";
  const deliveryFallbackCount = Array.from(deliveryAssetsByFormat.values()).filter(
    (asset) => asset.assetRole === "MASTER",
  ).length;
  const deliveryCountLabel =
    deliveryCount > 0 || deliveryFallbackCount > 0
      ? String(deliveryCount + deliveryFallbackCount)
      : "n/a";
  const uploadedMasterFileName = latestMasterAsset
    ? resolveUploadedFileNameFromStorageKey(latestMasterAsset.storageKey)
    : "";

  const failedJobs = track.transcodeJobs.filter((job) => job.status === "FAILED");
  const failedJobsCount = failedJobs.length;
  const lastFailedJob = [...failedJobs].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )[0];

  const disabled =
    isPending ||
    trackActionPending ||
    importTrackPending ||
    previewApplyPending ||
    reorderTrackPending ||
    trackUploadPending;

  return (
    <div
      className={`rounded-lg border bg-slate-950/60 p-3 transition-opacity ${
        isTrackDragOver ? "border-emerald-500/70 bg-emerald-950/10" : "border-slate-700"
      } ${isTrackDragging ? "opacity-70" : "opacity-100"}`}
      onDragOver={(event) => {
        if (!controller.draggingTrackIdByReleaseId[release.id] || reorderTrackPending) {
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        controller.setDragOverTrackIdByReleaseId((previous) => ({
          ...previous,
          [release.id]: track.id,
        }));
      }}
      onDrop={(event) => {
        event.preventDefault();
        void controller.onReorderTrackDrop(release, track.id);
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
              controller.setDraggingTrackIdByReleaseId((previous) => ({
                ...previous,
                [release.id]: track.id,
              }));
            }}
            onDragEnd={() => {
              controller.setDraggingTrackIdByReleaseId((previous) => ({
                ...previous,
                [release.id]: null,
              }));
              controller.setDragOverTrackIdByReleaseId((previous) => ({
                ...previous,
                [release.id]: null,
              }));
            }}
            className={`hidden select-none rounded border px-1 py-0.5 text-[11px] md:inline-flex md:w-4 md:shrink-0 md:justify-center ${
              isTrackDragging ? "border-emerald-500/70 text-emerald-300" : "border-slate-600 text-zinc-400"
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
          <p className="min-w-0 wrap-break-word text-left text-xs font-medium text-zinc-200">
            Track {track.trackNumber} • {track.title} • {formatTrackDuration(track.durationMs)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <button
            type="button"
            className={`${buttonClassName} px-2 py-1.5 md:hidden`}
            aria-label={`Move ${track.title} up`}
            title="Move up"
            disabled={disabled || moveUpTargetTrackId === null}
            onClick={() => {
              if (!moveUpTargetTrackId) {
                return;
              }
              void controller.onReorderTrackDrop(release, moveUpTargetTrackId, {
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
            disabled={disabled || moveDownTargetTrackId === null}
            onClick={() => {
              if (!moveDownTargetTrackId) {
                return;
              }
              void controller.onReorderTrackDrop(release, moveDownTargetTrackId, {
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
            disabled={disabled}
            onClick={() => {
              controller.setTrackDeleteDialog({
                releaseId: release.id,
                releaseTitle: release.title,
                track,
              });
            }}
          >
            <span className="sr-only">{trackPending ? "Deleting..." : "Delete"}</span>
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
            aria-label={isTrackExpanded ? "Hide track details" : "Show track details"}
            title={isTrackExpanded ? "Hide track details" : "Show track details"}
            disabled={disabled}
            onClick={() =>
              controller.setExpandedTrackIdByReleaseId((previous) => ({
                ...previous,
                [release.id]: isTrackExpanded ? null : track.id,
              }))
            }
          >
            <span className="sr-only">{isTrackExpanded ? "Hide details" : "Show details"}</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={`h-4 w-4 transition-transform ${isTrackExpanded ? "rotate-180" : ""}`}
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 md:mt-2 md:pl-7">
        <span className={previewStatus.className}>{previewStatus.label}</span>
        <span className={deliveryStatus.className}>{deliveryStatus.label}</span>
        {failedJobsCount > 0 ? (
          <span className="inline-flex items-center rounded-full border border-rose-700/70 bg-rose-950/40 px-2.5 py-1 text-[11px] font-medium leading-none text-rose-300">
            {failedJobsCount} failed
          </span>
        ) : null}
        <span className={trackMetaMutedChipClassName}>
          assets: {masterCount} master, {deliveryCountLabel} delivery, {previewCount} preview
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
        <ReleaseManagementTrackRowDetails
          release={release}
          track={track}
          trackDraft={trackDraft}
          isPending={isPending}
          trackActionPending={trackActionPending}
          importTrackPending={importTrackPending}
          previewApplyPending={previewApplyPending}
          reorderTrackPending={reorderTrackPending}
          trackUploadPending={trackUploadPending}
          trackRequeuePending={trackRequeuePending}
          trackPending={trackPending}
          trackUploadProgress={trackUploadProgress}
          trackUploadRole={trackUploadRole}
          setTrackUploadRole={(role) =>
            controller.setTrackUploadRoleById((previous) => ({
              ...previous,
              [track.id]: role,
            }))
          }
          deliveryDownloadOptions={deliveryDownloadOptions}
          deliveryDownloadAssetId={selectedDeliveryAssetId}
          setDeliveryDownloadAssetId={setDeliveryDownloadAssetId}
          masterDownloadAssetId={masterDownloadAssetId}
          failedJobsCount={failedJobsCount}
          lastFailedJob={lastFailedJob}
          controller={controller}
        />
      ) : null}
    </div>
  );
}
