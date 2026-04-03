import { useState } from "react";

import { ReleaseManagementTrackRow } from "./release-management-track-row";
import type { ReleaseRecord } from "./types";
import type { ReleaseManagementController } from "./use-release-management-controller";
import { sortTracks } from "./utils";

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
    controller,
  } = props;

  const visibleTracks = sortTracks(release.tracks).filter(
    (track) => !showFailedOnly || track.transcodeJobs.some((job) => job.status === "FAILED"),
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
        const trackOrderIndex = orderedTrackIndexById.get(track.id) ?? -1;
        const moveUpTargetTrackId =
          trackOrderIndex > 0 ? orderedTracks[trackOrderIndex - 1]?.id ?? null : null;
        const moveDownTargetTrackId =
          trackOrderIndex >= 0 && trackOrderIndex < orderedTracks.length - 1
            ? orderedTracks[trackOrderIndex + 1]?.id ?? null
            : null;

        return (
          <ReleaseManagementTrackRow
            key={track.id}
            controller={controller}
            release={release}
            track={track}
            isPending={isPending}
            importTrackPending={importTrackPending}
            previewApplyPending={previewApplyPending}
            reorderTrackPending={reorderTrackPending}
            isTrackExpanded={expandedTrackIdForRelease === track.id}
            isTrackDragging={draggingTrackIdForRelease === track.id}
            isTrackDragOver={dragOverTrackIdForRelease === track.id}
            moveUpTargetTrackId={moveUpTargetTrackId}
            moveDownTargetTrackId={moveDownTargetTrackId}
            deliveryDownloadAssetId={deliveryDownloadAssetIdByTrackId[track.id] ?? ""}
            setDeliveryDownloadAssetId={(assetId) =>
              setDeliveryDownloadAssetIdByTrackId((previous) => ({
                ...previous,
                [track.id]: assetId,
              }))
            }
          />
        );
      })}
    </div>
  );
}
