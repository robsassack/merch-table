import { AdminDialogPortal } from "./dialog-portal";
import {
  buttonClassName,
  dangerButtonClassName,
} from "./artist-management-panel-shared";
import type { ArtistRecord } from "./artist-management-panel-shared";

type ArtistManagementPurgeDialogProps = {
  artist: ArtistRecord;
  pendingArtistId: string | null;
  purgeConfirmInput: string;
  setPurgeConfirmInput: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ArtistManagementPurgeDialog(props: ArtistManagementPurgeDialogProps) {
  const {
    artist,
    pendingArtistId,
    purgeConfirmInput,
    setPurgeConfirmInput,
    onCancel,
    onConfirm,
  } = props;

  return (
    <AdminDialogPortal>
      <div
        className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75"
        role="dialog"
        aria-modal="true"
        aria-label="Confirm permanent artist purge"
      >
        <div className="flex min-h-full items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <h3 className="text-lg font-semibold text-zinc-100">Confirm permanent purge</h3>
            <p className="mt-2 text-sm text-zinc-400">
              This will permanently remove <span className="font-semibold">{artist.name}</span>.
              Type the artist name to confirm.
            </p>

            <label className="mt-4 flex flex-col gap-1 text-xs text-zinc-500">
              Artist name confirmation
              <input
                value={purgeConfirmInput}
                onChange={(event) => setPurgeConfirmInput(event.target.value)}
                className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
                placeholder={artist.name}
              />
            </label>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className={buttonClassName}
                onClick={onCancel}
                disabled={Boolean(pendingArtistId)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={dangerButtonClassName}
                disabled={Boolean(pendingArtistId) || purgeConfirmInput.trim() !== artist.name}
                onClick={onConfirm}
              >
                {pendingArtistId ? "Purging..." : "Confirm Purge"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </AdminDialogPortal>
  );
}
