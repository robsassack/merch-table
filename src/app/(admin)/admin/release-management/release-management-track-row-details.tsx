import { buttonClassName, dangerButtonClassName } from "./constants";
import type { ReleaseRecord, TrackDraft, TrackRecord, TrackTranscodeJobRecord } from "./types";
import type { ReleaseManagementController } from "./use-release-management-controller";

type DeliveryDownloadOption = {
  id: string;
  label: string;
};

type ReleaseManagementTrackRowDetailsProps = {
  release: ReleaseRecord;
  track: TrackRecord;
  trackDraft: TrackDraft;
  isPending: boolean;
  trackActionPending: boolean;
  importTrackPending: boolean;
  previewApplyPending: boolean;
  reorderTrackPending: boolean;
  trackUploadPending: boolean;
  trackRequeuePending: boolean;
  trackPending: boolean;
  trackUploadProgress: number;
  trackUploadRole: "MASTER" | "DELIVERY";
  setTrackUploadRole: (role: "MASTER" | "DELIVERY") => void;
  deliveryDownloadOptions: DeliveryDownloadOption[];
  deliveryDownloadAssetId: string;
  setDeliveryDownloadAssetId: (assetId: string) => void;
  masterDownloadAssetId: string;
  failedJobsCount: number;
  lastFailedJob?: TrackTranscodeJobRecord;
  controller: ReleaseManagementController;
};

export function ReleaseManagementTrackRowDetails(props: ReleaseManagementTrackRowDetailsProps) {
  const {
    release,
    track,
    trackDraft,
    isPending,
    trackActionPending,
    importTrackPending,
    previewApplyPending,
    reorderTrackPending,
    trackUploadPending,
    trackRequeuePending,
    trackPending,
    trackUploadProgress,
    trackUploadRole,
    setTrackUploadRole,
    deliveryDownloadOptions,
    deliveryDownloadAssetId,
    setDeliveryDownloadAssetId,
    masterDownloadAssetId,
    failedJobsCount,
    lastFailedJob,
    controller,
  } = props;

  const disabled =
    isPending ||
    trackActionPending ||
    importTrackPending ||
    previewApplyPending ||
    reorderTrackPending ||
    trackUploadPending;

  return (
    <>
      <div className="mt-3 grid gap-3 md:grid-cols-6">
        <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400 md:col-span-4">
          Title
          <input
            value={trackDraft.title}
            onChange={(event) =>
              controller.setTrackDraftsById((previous) => ({
                ...previous,
                [track.id]: {
                  ...trackDraft,
                  title: event.target.value,
                },
              }))
            }
            className="rounded-lg border border-slate-500/80 bg-slate-900/80 px-2.5 py-2 text-sm text-zinc-100 shadow-inner outline-none transition focus:border-emerald-400/80 focus:ring-2 focus:ring-emerald-500/20"
            disabled={disabled}
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400 md:col-span-2">
          Track Number
          <input
            value={trackDraft.trackNumber}
            onChange={(event) =>
              controller.setTrackDraftsById((previous) => ({
                ...previous,
                [track.id]: {
                  ...trackDraft,
                  trackNumber: event.target.value,
                },
              }))
            }
            className="rounded-lg border border-slate-500/80 bg-slate-900/80 px-2.5 py-2 text-sm text-zinc-100 shadow-inner outline-none transition focus:border-emerald-400/80 focus:ring-2 focus:ring-emerald-500/20"
            inputMode="numeric"
            disabled={disabled}
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400 md:col-span-6">
          Artist Override (Advanced)
          <input
            value={trackDraft.artistOverride ?? ""}
            onChange={(event) =>
              controller.setTrackDraftsById((previous) => {
                const baseDraft = previous[track.id] ?? trackDraft;
                return {
                  ...previous,
                  [track.id]: {
                    ...baseDraft,
                    artistOverride: event.target.value,
                  },
                };
              })
            }
            placeholder={`Leave blank to use release artist`}
            className="rounded-lg border border-slate-500/80 bg-slate-900/80 px-2.5 py-2 text-sm text-zinc-100 shadow-inner outline-none transition focus:border-emerald-400/80 focus:ring-2 focus:ring-emerald-500/20"
            disabled={disabled}
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400 md:col-span-3">
          Credits
          <textarea
            rows={3}
            value={trackDraft.credits}
            onChange={(event) =>
              controller.setTrackDraftsById((previous) => ({
                ...previous,
                [track.id]: {
                  ...trackDraft,
                  credits: event.target.value,
                },
              }))
            }
            className="min-h-22 rounded-lg border border-slate-500/80 bg-slate-900/80 px-2.5 py-2 text-sm text-zinc-100 shadow-inner outline-none transition focus:border-emerald-400/80 focus:ring-2 focus:ring-emerald-500/20"
            disabled={disabled}
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400 md:col-span-3">
          Lyrics
          <textarea
            rows={3}
            value={trackDraft.lyrics}
            onChange={(event) =>
              controller.setTrackDraftsById((previous) => ({
                ...previous,
                [track.id]: {
                  ...trackDraft,
                  lyrics: event.target.value,
                },
              }))
            }
            className="min-h-22 rounded-lg border border-slate-500/80 bg-slate-900/80 px-2.5 py-2 text-sm text-zinc-100 shadow-inner outline-none transition focus:border-emerald-400/80 focus:ring-2 focus:ring-emerald-500/20"
            disabled={disabled}
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={trackUploadRole}
          onChange={(event) =>
            setTrackUploadRole(event.target.value as "MASTER" | "DELIVERY")
          }
          disabled={disabled}
          className="rounded-md border border-slate-600 bg-slate-950 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-slate-400 disabled:opacity-50"
          aria-label={`Asset role for ${track.title}`}
        >
          <option value="MASTER">Master</option>
          <option value="DELIVERY">Delivery</option>
        </select>
        <label className={buttonClassName}>
          <input
            type="file"
            accept=".wav,.wave,audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/wave,audio/vnd.wave,audio/x-pn-wav,audio/flac,audio/x-flac,audio/aac,audio/mp4,audio/x-m4a,audio/ogg,audio/webm,audio/aiff,audio/x-aiff"
            className="hidden"
            onChange={(event) => void controller.onInlineTrackFileChange(release.id, track, event)}
            disabled={disabled}
          />
          {trackUploadPending
            ? `Uploading ${trackUploadProgress}%`
            : `Upload ${trackUploadRole === "MASTER" ? "Master" : "Delivery"}`}
        </label>
        {trackUploadRole === "DELIVERY" && deliveryDownloadOptions.length > 1 ? (
          <select
            value={deliveryDownloadAssetId}
            onChange={(event) => setDeliveryDownloadAssetId(event.target.value)}
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
          <span className={`${buttonClassName} cursor-not-allowed opacity-50`} aria-disabled="true">
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
          <span className={`${buttonClassName} cursor-not-allowed opacity-50`} aria-disabled="true">
            No Delivery
          </span>
        ) : null}
        {failedJobsCount > 0 ? (
          <button
            type="button"
            onClick={() => void controller.onRequeueTrackFailedTranscodes(release.id, track)}
            disabled={disabled}
            className={buttonClassName}
          >
            {trackRequeuePending ? "Queueing..." : `Requeue Failed (${failedJobsCount})`}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void controller.onUpdateTrack(release.id, track.id)}
          disabled={disabled}
          className={buttonClassName}
        >
          {trackPending ? "Saving..." : "Save Track"}
        </button>
        <button
          type="button"
          onClick={() => {
            controller.setTrackDeleteDialog({
              releaseId: release.id,
              releaseTitle: release.title,
              track,
            });
          }}
          disabled={disabled}
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
  );
}
