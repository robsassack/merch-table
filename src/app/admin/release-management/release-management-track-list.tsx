import { buttonClassName, dangerButtonClassName } from "./constants";
import type { ReleaseRecord } from "./types";
import type { ReleaseManagementController } from "./use-release-management-controller";
import { formatTrackDuration, getTrackPreviewStatus, sortTracks, toTrackDraft } from "./utils";

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
    setExpandedTrackIdByReleaseId,
    setDraggingTrackIdByReleaseId,
    setDragOverTrackIdByReleaseId,
    onReorderTrackDrop,
    onInlineTrackFileChange,
    onUpdateTrack,
    onDeleteTrack,
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
                          const masterCount = track.assets.filter(
                            (asset) => asset.assetRole === "MASTER",
                          ).length;
                          const deliveryCount = track.assets.filter(
                            (asset) => asset.assetRole === "DELIVERY",
                          ).length;
                          const previewCount = track.assets.filter(
                            (asset) => asset.assetRole === "PREVIEW",
                          ).length;
                          const lastFailedJob = track.transcodeJobs
                            .filter((job) => job.status === "FAILED")
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
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedTrackIdByReleaseId((previous) => ({
                                        ...previous,
                                        [release.id]: isTrackExpanded ? null : track.id,
                                      }))
                                    }
                                    className="text-left text-xs font-medium text-zinc-200 hover:text-zinc-100"
                                  >
                                    Track {track.trackNumber} • {track.title} •{" "}
                                    {formatTrackDuration(track.durationMs)} •{" "}
                                    {isTrackExpanded ? "Hide details" : "Edit details"}
                                  </button>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={previewStatus.className}>
                                    {previewStatus.label}
                                  </span>
                                  <span className="text-[11px] text-zinc-500">
                                    assets: {masterCount} master, {deliveryCount} delivery,{" "}
                                    {previewCount} preview
                                  </span>
                                </div>
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
                                    if (
                                      track.assets.length > 0 &&
                                      !window.confirm(
                                        "Deleting this track also removes its linked assets and preview jobs. Continue?",
                                      )
                                    ) {
                                      return;
                                    }
                                    void onDeleteTrack(release.id, track);
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
