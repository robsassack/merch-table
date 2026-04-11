import { AdminDialogPortal } from "../dialog-portal";
import { buttonClassName, dangerButtonClassName } from "./constants";
import type { ReleaseManagementController } from "./use-release-management-controller";

export function ReleaseManagementPurgeDialog(props: {
  controller: ReleaseManagementController;
}) {
  const {
    purgeDialogRelease,
    purgeConfirmInput,
    setPurgeConfirmInput,
    pendingReleaseId,
    setPurgeDialogRelease,
    onPurgeRelease,
    onHardDeleteRelease,
  } = props.controller;

  if (!purgeDialogRelease) {
    return null;
  }

  return (
    <AdminDialogPortal>
      <div
        className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75"
        role="dialog"
        aria-modal="true"
        aria-labelledby="release-purge-dialog-title"
        aria-describedby="release-purge-dialog-description"
      >
        <div className="flex min-h-full items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <h3 id="release-purge-dialog-title" className="text-lg font-semibold text-zinc-100">
              Confirm destructive action
            </h3>
            <p id="release-purge-dialog-description" className="mt-2 text-sm text-zinc-400">
              This permanently removes stored assets for{" "}
              <span className="font-semibold">{purgeDialogRelease.title}</span>. The release record
              remains for history and can no longer serve those files.
            </p>
            <p className="mt-2 text-sm text-zinc-500">
              Fully delete permanently removes both stored assets and the release record. Releases with
              existing orders cannot be fully deleted.
            </p>

            <label className="mt-4 flex flex-col gap-1 text-xs text-zinc-500">
              Release title confirmation
              <input
                value={purgeConfirmInput}
                onChange={(event) => setPurgeConfirmInput(event.target.value)}
                className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
                placeholder={purgeDialogRelease.title}
              />
            </label>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className={buttonClassName}
                onClick={() => {
                  if (pendingReleaseId) {
                    return;
                  }
                  setPurgeDialogRelease(null);
                  setPurgeConfirmInput("");
                }}
                disabled={Boolean(pendingReleaseId)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={dangerButtonClassName}
                disabled={
                  Boolean(pendingReleaseId) || purgeConfirmInput.trim() !== purgeDialogRelease.title
                }
                onClick={() => void onPurgeRelease(purgeDialogRelease, purgeConfirmInput)}
              >
                {pendingReleaseId ? "Purging..." : "Confirm Purge"}
              </button>
              <button
                type="button"
                className={dangerButtonClassName}
                disabled={
                  Boolean(pendingReleaseId) || purgeConfirmInput.trim() !== purgeDialogRelease.title
                }
                onClick={() => void onHardDeleteRelease(purgeDialogRelease, purgeConfirmInput)}
              >
                {pendingReleaseId ? "Deleting..." : "Fully Delete Record"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </AdminDialogPortal>
  );
}
