import { AdminDialogPortal } from "../dialog-portal";
import { buttonClassName } from "./constants";
import type { ReleaseManagementController } from "./use-release-management-controller";

export function ReleaseManagementImportConflictDialog(props: {
  controller: ReleaseManagementController;
}) {
  const {
    importConflictDialog,
    pendingTrackImportReleaseId,
    onResolveImportConflict,
  } = props.controller;

  if (!importConflictDialog) {
    return null;
  }

  const pending = pendingTrackImportReleaseId === importConflictDialog.releaseId;

  return (
    <AdminDialogPortal>
      <div
        className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75"
        role="dialog"
        aria-modal="true"
        aria-label="Resolve import conflict"
      >
        <div className="flex min-h-full items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <h3 className="text-lg font-semibold text-zinc-100">Track Import Conflict</h3>
            <p className="mt-2 text-sm text-zinc-400">
              <span className="font-semibold">{importConflictDialog.releaseTitle}</span> already has{" "}
              {importConflictDialog.existingTrackCount} track
              {importConflictDialog.existingTrackCount === 1 ? "" : "s"}.
            </p>
            <p className="mt-2 text-sm text-zinc-500">
              Choose how to handle the incoming files:
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className={buttonClassName}
                disabled={pending}
                onClick={() => void onResolveImportConflict("append")}
              >
                Append
              </button>
              <button
                type="button"
                className={buttonClassName}
                disabled={pending}
                onClick={() => void onResolveImportConflict("insert")}
              >
                Insert
              </button>
              <button
                type="button"
                className={buttonClassName}
                disabled={pending}
                onClick={() => void onResolveImportConflict("cancel")}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </AdminDialogPortal>
  );
}
