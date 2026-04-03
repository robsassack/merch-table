import { formatIsoTimestampForDisplay } from "@/lib/time/format-display";

import {
  buttonClassName,
  dangerButtonClassName,
  getArtistUrlPreview,
  sanitizeUrlInput,
} from "./artist-management-panel-shared";
import type { ArtistDraft, ArtistRecord } from "./artist-management-panel-shared";

type ArtistManagementArtistCardProps = {
  artist: ArtistRecord;
  draft: ArtistDraft;
  isPending: boolean;
  createPending: boolean;
  advancedOpen: boolean;
  onDraftChange: (next: ArtistDraft) => void;
  onToggleAdvanced: () => void;
  onSave: () => void;
  onSoftDeleteOrRestore: () => void;
  onOpenPurgeDialog: () => void;
};

export function ArtistManagementArtistCard(props: ArtistManagementArtistCardProps) {
  const {
    artist,
    draft,
    isPending,
    createPending,
    advancedOpen,
    onDraftChange,
    onToggleAdvanced,
    onSave,
    onSoftDeleteOrRestore,
    onOpenPurgeDialog,
  } = props;

  return (
    <article className="rounded-xl border border-slate-700 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-zinc-100">{artist.name}</h3>
          {artist.deletedAt ? (
            <span className="rounded-full border border-amber-700/70 bg-amber-950/50 px-2 py-0.5 text-[11px] font-medium text-amber-300">
              deleted
            </span>
          ) : null}
        </div>
        <p className="text-xs text-zinc-500">{artist._count.releases} releases</p>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-zinc-500 sm:col-span-2">
          Name (required)
          <input
            required
            maxLength={120}
            value={draft.name}
            onChange={(event) => onDraftChange({ ...draft, name: event.target.value })}
            className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-zinc-500 sm:col-span-2">
          Location
          <input
            maxLength={160}
            value={draft.location}
            onChange={(event) => onDraftChange({ ...draft, location: event.target.value })}
            className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-zinc-500 sm:col-span-2">
          Bio
          <textarea
            rows={3}
            maxLength={4_000}
            value={draft.bio}
            onChange={(event) => onDraftChange({ ...draft, bio: event.target.value })}
            className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
          />
        </label>

        {advancedOpen ? (
          <label className="flex flex-col gap-1 text-xs text-zinc-500 sm:col-span-2">
            URL
            <input
              maxLength={120}
              value={draft.slug}
              onChange={(event) =>
                onDraftChange({
                  ...draft,
                  slug: sanitizeUrlInput(event.target.value),
                })
              }
              className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
            />
            <span className="text-[11px] text-zinc-500">
              Preview: {getArtistUrlPreview(draft.name, draft.slug)}
            </span>
          </label>
        ) : null}
      </div>

      <p className="mt-3 text-xs text-zinc-500">
        Updated {formatIsoTimestampForDisplay(artist.updatedAt)}
        {artist.deletedAt ? ` • Deleted ${formatIsoTimestampForDisplay(artist.deletedAt)}` : ""}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={isPending || createPending}
          onClick={onToggleAdvanced}
          className={buttonClassName}
        >
          {advancedOpen ? "Hide Advanced" : "Advanced"}
        </button>

        <button
          type="button"
          disabled={isPending || createPending}
          onClick={onSave}
          className={buttonClassName}
        >
          {isPending ? "Saving..." : "Save"}
        </button>

        <button
          type="button"
          disabled={isPending || createPending}
          onClick={onSoftDeleteOrRestore}
          className={buttonClassName}
        >
          {isPending
            ? artist.deletedAt
              ? "Restoring..."
              : "Deleting..."
            : artist.deletedAt
              ? "Restore"
              : "Soft Delete"}
        </button>

        {artist.deletedAt ? (
          <button
            type="button"
            disabled={isPending || createPending}
            onClick={onOpenPurgeDialog}
            className={dangerButtonClassName}
          >
            {isPending ? "Purging..." : "Permanently Purge"}
          </button>
        ) : null}
      </div>
    </article>
  );
}
