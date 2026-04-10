"use client";

export function AdvancedPanel({
  panelCardClassName,
  secondaryButtonClassName,
}: {
  panelCardClassName: string;
  secondaryButtonClassName: string;
}) {
  return (
    <div className="space-y-4">
      <section className={panelCardClassName}>
        <h3 className="text-xl font-semibold tracking-tight text-zinc-100">Factory Reset</h3>
        <p className="mt-1 text-sm text-zinc-400">
          Re-run setup without wiping data unless a separate destructive action is explicitly confirmed.
        </p>
        <div className="mt-4 rounded-lg border border-dashed border-slate-600 bg-slate-900/80 p-4">
          <p className="text-sm text-zinc-300">
            This flow is planned and currently unavailable in the admin UI.
          </p>
          <button type="button" disabled className={`mt-3 ${secondaryButtonClassName}`}>
            Factory Reset (Coming Soon)
          </button>
        </div>
      </section>

      <section className={panelCardClassName}>
        <h3 className="text-xl font-semibold tracking-tight text-zinc-100">Storage Migration History</h3>
        <p className="mt-1 text-sm text-zinc-400">
          Guided migration controls are available in Integrations → Storage. Migration history and rollback tooling will be added here.
        </p>
        <div className="mt-4 rounded-lg border border-dashed border-slate-600 bg-slate-900/80 p-4">
          <p className="text-sm text-zinc-300">History and rollback tools are planned for a later Phase 9 follow-up.</p>
          <button type="button" disabled className={`mt-3 ${secondaryButtonClassName}`}>
            View Migration History (Coming Soon)
          </button>
        </div>
      </section>
    </div>
  );
}
