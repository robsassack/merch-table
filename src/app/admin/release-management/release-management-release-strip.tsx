import type { ReleaseManagementController } from "./use-release-management-controller";
import { toCoverDisplaySrc } from "./utils";

export function ReleaseManagementReleaseStrip(props: {
  controller: ReleaseManagementController;
}) {
  const {
    releases,
    selectedReleaseId,
    setSelectedReleaseId,
    setCreateComposerOpen,
    localCoverPreviewById,
    draftsById,
  } = props.controller;

  return (
    <div className="mt-5">
      <p className="text-xs uppercase tracking-wide text-zinc-500">Releases</p>
      <div className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-2 snap-x snap-mandatory sm:mx-0 sm:gap-3 sm:px-0">
        <button
          type="button"
          onClick={() => setCreateComposerOpen(true)}
          className="flex h-28 w-28 shrink-0 snap-start flex-col items-center justify-center rounded-xl border border-dashed border-slate-600 bg-slate-900/60 text-zinc-300 transition hover:border-slate-400 hover:text-zinc-100 sm:h-32 sm:w-32"
          aria-label="Create new release"
        >
          <span className="text-2xl leading-none">+</span>
          <span className="mt-2 text-xs font-medium">Create</span>
        </button>

        {releases.map((release) => {
          const isSelected = selectedReleaseId === release.id;
          const cardCoverPreviewSrc =
            localCoverPreviewById[release.id] ??
            draftsById[release.id]?.coverImageUrl ??
            release.coverImageUrl;
          const cardDisplaySrc = cardCoverPreviewSrc
            ? toCoverDisplaySrc(cardCoverPreviewSrc)
            : "";

          return (
            <button
              key={release.id}
              type="button"
              onClick={() => {
                setSelectedReleaseId(release.id);
                setCreateComposerOpen(false);
              }}
              className={`group flex h-28 w-28 shrink-0 snap-start flex-col overflow-hidden rounded-xl border text-left transition sm:h-32 sm:w-32 ${
                isSelected
                  ? "border-emerald-500/70 bg-emerald-950/30"
                  : "border-slate-700 bg-slate-900/50 hover:border-slate-500"
              }`}
              aria-pressed={isSelected}
              aria-label={`Select release ${release.title}`}
            >
              {cardDisplaySrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={cardDisplaySrc}
                  alt={`${release.title} cover`}
                  className="h-16 w-full object-cover sm:h-20"
                />
              ) : (
                <div className="flex h-16 w-full items-center justify-center bg-slate-800 text-[11px] text-zinc-500 sm:h-20">
                  no artwork
                </div>
              )}

              <div className="flex min-h-0 flex-1 items-center justify-between gap-2 px-2 py-1.5">
                <p className="line-clamp-2 text-[11px] font-medium text-zinc-200 sm:text-xs">
                  {release.title}
                </p>
                {release.deletedAt ? (
                  <span className="shrink-0 rounded-full border border-amber-700/70 bg-amber-950/50 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                    del
                  </span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
