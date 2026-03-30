import { buttonClassName, previewModeOptions } from "./constants";
import { ReleaseManagementTrackList } from "./release-management-track-list";
import type { PreviewMode, ReleaseDraft, ReleaseRecord } from "./types";
import type { ReleaseManagementController } from "./use-release-management-controller";
import { formatTrackDuration, toNewTrackDraft, toReleasePreviewDraft } from "./utils";

export function ReleaseManagementTrackManagement(props: {
  controller: ReleaseManagementController;
  release: ReleaseRecord;
  draft: ReleaseDraft;
  isPending: boolean;
  importTrackPending: boolean;
  previewApplyPending: boolean;
  reorderTrackPending: boolean;
}) {
  const {
    release,
    isPending,
    importTrackPending,
    previewApplyPending,
    reorderTrackPending,
  } = props;
  const {
    newTrackByReleaseId,
    setNewTrackByReleaseId,
    previewByReleaseId,
    setPreviewByReleaseId,
    pendingTrackCreateReleaseId,
    pendingTrackUploadId,
    pendingTrackId,
    trackImportJobsByReleaseId,
    expandedTrackIdByReleaseId,
    draggingTrackIdByReleaseId,
    dragOverTrackIdByReleaseId,
    onApplyReleasePreviewToTracks,
    onImportTrackFiles,
    onCreateTrack,
  } = props.controller;

  const importJobs = trackImportJobsByReleaseId[release.id] ?? [];
  const expandedTrackIdForRelease = expandedTrackIdByReleaseId[release.id] ?? null;
  const draggingTrackIdForRelease = draggingTrackIdByReleaseId[release.id] ?? null;
  const dragOverTrackIdForRelease = dragOverTrackIdByReleaseId[release.id] ?? null;

  return (
                  <div className="rounded-lg border border-slate-700/80 bg-slate-900/50 p-3 text-xs text-zinc-400 sm:col-span-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-zinc-300">Track Management</p>
                      <p className="text-[11px] text-zinc-500">
                        {release.tracks.length} track{release.tracks.length === 1 ? "" : "s"}
                      </p>
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-6">
                      {(() => {
                        const newTrackDraft =
                          newTrackByReleaseId[release.id] ?? toNewTrackDraft(release);
                        const previewDraft =
                          previewByReleaseId[release.id] ?? toReleasePreviewDraft(release);
                        const createTrackPending = pendingTrackCreateReleaseId === release.id;

                        return (
                          <>
                            <div className="mb-2 grid gap-2 rounded-md border border-slate-700/70 bg-slate-950/60 p-2 sm:col-span-6 sm:grid-cols-6">
                              <label className="flex flex-col gap-1 text-[11px] text-zinc-500 sm:col-span-2">
                                Release preview mode
                                <select
                                  value={previewDraft.previewMode}
                                  onChange={(event) => {
                                    const nextDraft = {
                                      ...previewDraft,
                                      previewMode: event.target.value as PreviewMode,
                                    };
                                    setPreviewByReleaseId((previous) => ({
                                      ...previous,
                                      [release.id]: {
                                        ...nextDraft,
                                      },
                                    }));
                                    if (release.tracks.length > 0) {
                                      void onApplyReleasePreviewToTracks(release, nextDraft, {
                                        silent: true,
                                      });
                                    }
                                  }}
                                  className="rounded-md border border-slate-600 bg-slate-950 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-slate-400"
                                  disabled={
                                    isPending ||
                                    createTrackPending ||
                                    importTrackPending ||
                                    previewApplyPending ||
                                    reorderTrackPending
                                  }
                                >
                                  {previewModeOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="flex flex-col gap-1 text-[11px] text-zinc-500 sm:col-span-2">
                                Release preview seconds
                                <input
                                  value={previewDraft.previewSeconds}
                                  onChange={(event) =>
                                    setPreviewByReleaseId((previous) => ({
                                      ...previous,
                                      [release.id]: {
                                        ...previewDraft,
                                        previewSeconds: event.target.value,
                                      },
                                    }))
                                  }
                                  onBlur={(event) => {
                                    if (release.tracks.length === 0) {
                                      return;
                                    }

                                    const nextDraft = {
                                      ...previewDraft,
                                      previewSeconds: event.target.value,
                                    };
                                    void onApplyReleasePreviewToTracks(release, nextDraft, {
                                      silent: true,
                                    });
                                  }}
                                  className="rounded-md border border-slate-600 bg-slate-950 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-slate-400 disabled:opacity-50"
                                  inputMode="numeric"
                                  placeholder="30"
                                  disabled={
                                    isPending ||
                                    createTrackPending ||
                                    importTrackPending ||
                                    previewApplyPending ||
                                    reorderTrackPending ||
                                    previewDraft.previewMode === "FULL"
                                  }
                                />
                              </label>
                              <div className="sm:col-span-2" />
                              <p className="text-[11px] text-zinc-500 sm:col-span-6">
                                New and existing tracks use this release preview setting
                                automatically.
                              </p>
                            </div>
                            <div className="mb-2 flex flex-wrap items-center gap-2 sm:col-span-6">
                              <label className={buttonClassName}>
                                <input
                                  type="file"
                                  accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/wave,audio/flac,audio/x-flac,audio/aac,audio/mp4,audio/x-m4a,audio/ogg,audio/webm,audio/aiff,audio/x-aiff"
                                  className="hidden"
                                  multiple
                                  onChange={(event) => void onImportTrackFiles(release, event)}
                                  disabled={
                                    isPending ||
                                    createTrackPending ||
                                    importTrackPending ||
                                    previewApplyPending ||
                                    reorderTrackPending ||
                                    pendingTrackUploadId !== null ||
                                    pendingTrackId !== null
                                  }
                                />
                                {importTrackPending ? "Importing tracks..." : "Import Tracks"}
                              </label>
                              <p className="text-[11px] text-zinc-500">
                                Batch create tracks from files and upload masters in one step.
                              </p>
                            </div>
                            {importJobs.length > 0 ? (
                              <div className="mb-2 space-y-1 rounded-md border border-slate-700/70 bg-slate-950/60 p-2 text-[11px] text-zinc-400 sm:col-span-6">
                                {importJobs.map((job) => (
                                  <p key={job.id}>
                                    #{job.plannedTrackNumber} {job.title} ({formatTrackDuration(job.durationMs)}){" "}
                                    - {job.status}
                                    {job.error ? `: ${job.error}` : ""}
                                  </p>
                                ))}
                              </div>
                            ) : null}
                            <label className="flex flex-col gap-1 text-[11px] text-zinc-500 sm:col-span-2">
                              New track title
                              <input
                                value={newTrackDraft.title}
                                onChange={(event) =>
                                  setNewTrackByReleaseId((previous) => ({
                                    ...previous,
                                    [release.id]: {
                                      ...newTrackDraft,
                                      title: event.target.value,
                                    },
                                  }))
                                }
                                className="rounded-md border border-slate-600 bg-slate-950 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-slate-400"
                                placeholder="Track title"
                                disabled={
                                  isPending ||
                                  createTrackPending ||
                                  importTrackPending ||
                                  previewApplyPending ||
                                  reorderTrackPending
                                }
                              />
                            </label>
                            <label className="flex flex-col gap-1 text-[11px] text-zinc-500">
                              Track Number
                              <input
                                value={newTrackDraft.trackNumber}
                                onChange={(event) =>
                                  setNewTrackByReleaseId((previous) => ({
                                    ...previous,
                                    [release.id]: {
                                      ...newTrackDraft,
                                      trackNumber: event.target.value,
                                    },
                                  }))
                                }
                                className="rounded-md border border-slate-600 bg-slate-950 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-slate-400"
                                inputMode="numeric"
                                placeholder={String(release.tracks.length + 1)}
                                disabled={
                                  isPending ||
                                  createTrackPending ||
                                  importTrackPending ||
                                  previewApplyPending ||
                                  reorderTrackPending
                                }
                              />
                            </label>
                            <label className="flex flex-col gap-1 text-[11px] text-zinc-500 sm:col-span-6">
                              Credits
                              <textarea
                                rows={2}
                                value={newTrackDraft.credits}
                                onChange={(event) =>
                                  setNewTrackByReleaseId((previous) => ({
                                    ...previous,
                                    [release.id]: {
                                      ...newTrackDraft,
                                      credits: event.target.value,
                                    },
                                  }))
                                }
                                className="rounded-md border border-slate-600 bg-slate-950 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-slate-400"
                                placeholder="Optional credits"
                                disabled={
                                  isPending ||
                                  createTrackPending ||
                                  importTrackPending ||
                                  previewApplyPending ||
                                  reorderTrackPending
                                }
                              />
                            </label>
                            <label className="flex flex-col gap-1 text-[11px] text-zinc-500 sm:col-span-6">
                              Lyrics
                              <textarea
                                rows={2}
                                value={newTrackDraft.lyrics}
                                onChange={(event) =>
                                  setNewTrackByReleaseId((previous) => ({
                                    ...previous,
                                    [release.id]: {
                                      ...newTrackDraft,
                                      lyrics: event.target.value,
                                    },
                                  }))
                                }
                                className="rounded-md border border-slate-600 bg-slate-950 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-slate-400"
                                placeholder="Optional lyrics"
                                disabled={
                                  isPending ||
                                  createTrackPending ||
                                  importTrackPending ||
                                  previewApplyPending ||
                                  reorderTrackPending
                                }
                              />
                            </label>
                            <div className="sm:col-span-6">
                              <button
                                type="button"
                                onClick={() => void onCreateTrack(release)}
                                disabled={
                                  isPending ||
                                  createTrackPending ||
                                  importTrackPending ||
                                  previewApplyPending ||
                                  reorderTrackPending
                                }
                                className={buttonClassName}
                              >
                                {createTrackPending
                                  ? "Adding track..."
                                  : reorderTrackPending
                                    ? "Reordering..."
                                    : "Add Track"}
                              </button>
                            </div>
                          </>
                        );
                      })()}
                    </div>

                    {release.tracks.length === 0 ? (
                      <p className="mt-3 rounded-lg border border-dashed border-slate-700/80 p-3 text-xs text-zinc-500">
                        No tracks yet. Import files or add a track manually, then upload master and
                        delivery assets.
                      </p>
                    ) : (
                      <ReleaseManagementTrackList
                        controller={props.controller}
                        release={release}
                        isPending={isPending}
                        importTrackPending={importTrackPending}
                        previewApplyPending={previewApplyPending}
                        reorderTrackPending={reorderTrackPending}
                        expandedTrackIdForRelease={expandedTrackIdForRelease}
                        draggingTrackIdForRelease={draggingTrackIdForRelease}
                        dragOverTrackIdForRelease={dragOverTrackIdForRelease}
                      />
                    )}
                  </div>
  );
}
