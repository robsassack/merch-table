import { ReleaseManagementCreateForm } from "./release-management-create-form";
import { ReleaseManagementImportConflictDialog } from "./release-management-import-conflict-dialog";
import { ReleaseManagementPurgeDialog } from "./release-management-purge-dialog";
import { ReleaseManagementReleaseStrip } from "./release-management-release-strip";
import { ReleaseManagementSelectedReleaseList } from "./release-management-selected-release-list";
import { ReleaseManagementTrackDeleteDialog } from "./release-management-track-delete-dialog";
import type { ReleaseManagementController } from "./use-release-management-controller";

export function ReleaseManagementPanelView(props: {
  controller: ReleaseManagementController;
}) {
  const {
    isHydrated,
    releases,
    deletedCount,
    createComposerOpen,
    selectedReleaseId,
    notice,
    error,
    loading,
  } = props.controller;

  if (!isHydrated) {
    return (
      <section className="mt-8 rounded-2xl border border-slate-700/90 bg-slate-950/50 p-5 sm:p-6">
        <p className="text-sm text-zinc-500">Loading release management…</p>
      </section>
    );
  }

  return (
    <section className="mt-8 rounded-2xl border border-slate-700/90 bg-slate-950/50 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold tracking-tight text-zinc-100">Release Management</h2>
        <p className="text-xs text-zinc-500">
          {releases.length} total, {deletedCount} deleted
        </p>
      </div>

      <p className="mt-2 text-sm text-zinc-500">
        Create releases, configure pricing, disclose lossy-only quality, and manage soft delete,
        restore, and permanent asset purge.
      </p>

      <ReleaseManagementReleaseStrip controller={props.controller} />
      <ReleaseManagementCreateForm controller={props.controller} />

      {notice ? <p className="mt-4 text-sm text-emerald-400">{notice}</p> : null}
      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

      {loading ? (
        <p className="mt-5 text-sm text-zinc-500">Loading releases...</p>
      ) : releases.length === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed border-slate-700 p-4 text-sm text-zinc-500">
          No releases yet. Use the + card above to create your first release.
        </p>
      ) : createComposerOpen ? (
        <p className="mt-5 rounded-xl border border-dashed border-slate-700 p-4 text-sm text-zinc-500">
          Creating a new release. Close the composer to return to release editing.
        </p>
      ) : selectedReleaseId === null ? (
        <p className="mt-5 rounded-xl border border-dashed border-slate-700 p-4 text-sm text-zinc-500">
          Select a release from the top strip.
        </p>
      ) : (
        <ReleaseManagementSelectedReleaseList controller={props.controller} />
      )}

      <ReleaseManagementPurgeDialog controller={props.controller} />
      <ReleaseManagementImportConflictDialog controller={props.controller} />
      <ReleaseManagementTrackDeleteDialog controller={props.controller} />
    </section>
  );
}
