import { AdminDialogPortal } from "../dialog-portal";
import { buttonClassName, dangerButtonClassName } from "./constants";
import type { ReleaseManagementController } from "./use-release-management-controller";

export function ReleaseManagementTrackDeleteDialog(props: {
  controller: ReleaseManagementController;
}) {
  const {
    trackDeleteDialog,
    pendingTrackId,
    pendingTrackImportReleaseId,
    pendingPreviewApplyReleaseId,
    pendingTrackReorderReleaseId,
    pendingTrackUploadId,
    pendingReleaseId,
    createPending,
    setTrackDeleteDialog,
    onDeleteTrack,
  } = props.controller;

  if (!trackDeleteDialog) {
    return null;
  }

  const track = trackDeleteDialog.track;
  const deleting = pendingTrackId === track.id;
  const pending =
    deleting ||
    pendingTrackImportReleaseId === trackDeleteDialog.releaseId ||
    pendingPreviewApplyReleaseId === trackDeleteDialog.releaseId ||
    pendingTrackReorderReleaseId === trackDeleteDialog.releaseId ||
    pendingTrackUploadId === track.id ||
    Boolean(pendingReleaseId) ||
    createPending;

  return (
    <AdminDialogPortal>
      <div
        className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75"
        role="dialog"
        aria-modal="true"
        aria-label="Confirm track deletion"
      >
        <div className="flex min-h-full items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <h3 className="text-lg font-semibold text-zinc-100">Delete track?</h3>
            <p className="mt-2 text-sm text-zinc-400">
              This removes <span className="font-semibold">{track.title}</span> from{" "}
              <span className="font-semibold">{trackDeleteDialog.releaseTitle}</span>.
            </p>
            {track.assets.length > 0 ? (
              <p className="mt-2 text-sm text-zinc-500">
                Linked assets and preview jobs for this track will also be removed.
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className={buttonClassName}
                disabled={pending}
                onClick={() => {
                  if (pending) {
                    return;
                  }
                  setTrackDeleteDialog(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className={dangerButtonClassName}
                disabled={pending}
                onClick={() => {
                  setTrackDeleteDialog(null);
                  void onDeleteTrack(trackDeleteDialog.releaseId, track);
                }}
              >
                {deleting ? "Deleting..." : "Delete Track"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </AdminDialogPortal>
  );
}
