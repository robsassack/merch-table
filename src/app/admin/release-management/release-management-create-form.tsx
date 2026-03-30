import {
  buttonClassName,
  pricingModeOptions,
  primaryButtonClassName,
  statusOptions,
} from "./constants";
import type { ReleaseManagementController } from "./use-release-management-controller";
import type { PricingMode, ReleaseStatus } from "./types";
import {
  getReleaseUrlPreview,
  sanitizeUrlInput,
  slugify,
  toCoverDisplaySrc,
} from "./utils";

export function ReleaseManagementCreateForm(props: {
  controller: ReleaseManagementController;
}) {
  const {
    createComposerOpen,
    onCreateRelease,
    createAdvancedOpen,
    setCreateAdvancedOpen,
    setCreateComposerOpen,
    newArtistId,
    setNewArtistId,
    artists,
    newTitle,
    setNewTitle,
    newSlug,
    setNewSlug,
    newUrlTouched,
    setNewUrlTouched,
    newDescription,
    setNewDescription,
    onNewCoverFileChange,
    createPending,
    coverUploadTarget,
    newCoverImageUrl,
    newCoverStorageKey,
    setNewCoverImageUrl,
    setNewCoverPreviewUrl,
    revokeLocalObjectUrl,
    setNewCoverStorageKey,
    newCoverPreviewSrc,
    newPricingMode,
    setNewPricingMode,
    newStatus,
    setNewStatus,
    newReleaseDate,
    setNewReleaseDate,
    newFixedPrice,
    setNewFixedPrice,
    newMinimumPrice,
    setNewMinimumPrice,
    newAllowFreeCheckout,
    setNewAllowFreeCheckout,
    storeCurrency,
    renderPricingDetails,
    newMarkLossyOnly,
    setNewMarkLossyOnly,
    newConfirmLossyOnly,
    setNewConfirmLossyOnly,
    activeArtists,
  } = props.controller;

  if (!createComposerOpen) {
    return null;
  }

  return (
      <form onSubmit={onCreateRelease} className="mt-5 rounded-xl border border-slate-700 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-zinc-200">Create release</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCreateAdvancedOpen((previous) => !previous)}
              className={buttonClassName}
            >
              {createAdvancedOpen ? "Hide Advanced" : "Advanced"}
            </button>
            <button
              type="button"
              onClick={() => setCreateComposerOpen(false)}
              className={buttonClassName}
            >
              Close
            </button>
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-zinc-500 sm:col-span-2">
            Artist (required)
            <select
              required
              value={newArtistId}
              onChange={(event) => setNewArtistId(event.target.value)}
              className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
            >
              <option value="" disabled>
                Select artist
              </option>
              {artists.map((artist) => (
                <option key={artist.id} value={artist.id} disabled={artist.deletedAt !== null}>
                  {artist.name}
                  {artist.deletedAt ? " (deleted)" : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-zinc-500 sm:col-span-2">
            Title (required)
            <input
              required
              maxLength={160}
              value={newTitle}
              onChange={(event) => {
                const value = event.target.value;
                setNewTitle(value);
                if (!newUrlTouched) {
                  setNewSlug(slugify(value));
                }
              }}
              className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
              placeholder="Release title"
            />
          </label>

          {createAdvancedOpen ? (
            <label className="flex flex-col gap-1 text-xs text-zinc-500 sm:col-span-2">
              URL
              <input
                maxLength={160}
                value={newSlug}
                onChange={(event) => {
                  setNewSlug(sanitizeUrlInput(event.target.value));
                  setNewUrlTouched(true);
                }}
                className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
                placeholder="release-title"
              />
              <span className="text-[11px] text-zinc-500">
                Preview: {getReleaseUrlPreview(newTitle, newSlug)}
              </span>
            </label>
          ) : null}

          <label className="flex flex-col gap-1 text-xs text-zinc-500 sm:col-span-2">
            Description
            <textarea
              rows={3}
              maxLength={4_000}
              value={newDescription}
              onChange={(event) => setNewDescription(event.target.value)}
              className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
              placeholder="Optional release description"
            />
          </label>

          <div className="rounded-lg border border-slate-700/80 bg-slate-900/50 p-3 text-xs text-zinc-400 sm:col-span-2">
            <p className="font-medium text-zinc-300">Cover artwork</p>
            <p className="mt-1">
              Upload square artwork for this release. JPEG, PNG, WEBP, AVIF, and GIF are supported.
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label className={buttonClassName}>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
                  className="hidden"
                  onChange={(event) => void onNewCoverFileChange(event)}
                  disabled={createPending || coverUploadTarget === "new"}
                />
                {coverUploadTarget === "new" ? "Uploading..." : "Upload Cover"}
              </label>

              <button
                type="button"
                className={buttonClassName}
                disabled={
                  createPending ||
                  coverUploadTarget === "new" ||
                  (newCoverImageUrl.length === 0 && newCoverStorageKey === null)
                }
                onClick={() => {
                  setNewCoverImageUrl("");
                  setNewCoverPreviewUrl((previous) => {
                    revokeLocalObjectUrl(previous);
                    return null;
                  });
                  setNewCoverStorageKey(null);
                }}
              >
                Remove Cover
              </button>
            </div>

            {newCoverPreviewSrc ? (
              <div className="mt-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={toCoverDisplaySrc(newCoverPreviewSrc)}
                  alt="New release cover preview"
                  className="h-28 w-28 rounded-lg border border-slate-700 object-cover"
                />
              </div>
            ) : (
              <p className="mt-3 text-xs text-zinc-500">No cover uploaded yet.</p>
            )}
          </div>

          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            Pricing mode
            <select
              value={newPricingMode}
              onChange={(event) => {
                const mode = event.target.value as PricingMode;
                setNewPricingMode(mode);
                if (mode !== "PWYW") {
                  setNewAllowFreeCheckout(false);
                }
              }}
              className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
            >
              {pricingModeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            Status
            <select
              value={newStatus}
              onChange={(event) => setNewStatus(event.target.value as ReleaseStatus)}
              className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            Release date
            <input
              type="date"
              required
              value={newReleaseDate}
              onChange={(event) => setNewReleaseDate(event.target.value)}
              className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
            />
          </label>

          {newPricingMode === "FIXED" ? (
            <label className="flex flex-col gap-1 text-xs text-zinc-500 sm:col-span-2">
              Fixed price ({storeCurrency})
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={newFixedPrice}
                onChange={(event) => setNewFixedPrice(event.target.value)}
                className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
                placeholder="5.00"
              />
            </label>
          ) : null}

          {newPricingMode === "PWYW" ? (
            <div className="flex flex-col gap-2 text-xs text-zinc-500 sm:col-span-2">
              <label className="flex flex-col gap-1">
                PWYW minimum ({storeCurrency})
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={newMinimumPrice}
                  onChange={(event) => setNewMinimumPrice(event.target.value)}
                  className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
                  placeholder={newAllowFreeCheckout ? "0.00" : "2.00"}
                />
              </label>
              <label className="inline-flex items-center gap-2 text-zinc-300">
                <input
                  type="checkbox"
                  checked={newAllowFreeCheckout}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setNewAllowFreeCheckout(checked);
                    if (checked && newMinimumPrice.trim().length === 0) {
                      setNewMinimumPrice("0.00");
                    }
                  }}
                />
                Allow free checkout ($0)
              </label>
            </div>
          ) : null}

          <div className="rounded-lg border border-slate-700/80 bg-slate-900/50 p-3 text-xs text-zinc-400 sm:col-span-2">
            <p className="font-medium text-zinc-300">Pricing estimate</p>
            {renderPricingDetails(
              {
                artistId: newArtistId,
                title: newTitle,
                slug: newSlug,
                description: newDescription,
                coverImageUrl: newCoverImageUrl,
                coverStorageKey: newCoverStorageKey,
                removeCoverImage: false,
                pricingMode: newPricingMode,
                fixedPrice: newFixedPrice,
                minimumPrice: newMinimumPrice,
                allowFreeCheckout: newAllowFreeCheckout,
                status: newStatus,
                releaseDate: newReleaseDate,
                markLossyOnly: newMarkLossyOnly,
                confirmLossyOnly: newConfirmLossyOnly,
              },
              storeCurrency,
            )}
          </div>

          <div className="rounded-lg border border-slate-700/80 bg-slate-900/50 p-3 text-xs text-zinc-400 sm:col-span-2">
            <p className="font-medium text-zinc-300">Master quality workflow</p>
            <p className="mt-1">
              Upload lossless masters first when possible. If you only have lossy files, mark this
              release as lossy-only and confirm disclosure.
            </p>

            <div className="mt-3 flex flex-col gap-2">
              <label className="inline-flex items-start gap-2">
                <input
                  type="radio"
                  name="new-lossless"
                  checked={!newMarkLossyOnly}
                  onChange={() => {
                    setNewMarkLossyOnly(false);
                    setNewConfirmLossyOnly(false);
                  }}
                  className="mt-0.5"
                />
                <span className="text-zinc-300">Lossless masters available</span>
              </label>
              <label className="inline-flex items-start gap-2">
                <input
                  type="radio"
                  name="new-lossless"
                  checked={newMarkLossyOnly}
                  onChange={() => {
                    setNewMarkLossyOnly(true);
                    setNewConfirmLossyOnly(false);
                  }}
                  className="mt-0.5"
                />
                <span className="text-zinc-300">Lossy-only for now</span>
              </label>
            </div>

            {newMarkLossyOnly ? (
              <label className="mt-3 inline-flex items-start gap-2 rounded-lg border border-amber-700/60 bg-amber-950/40 px-3 py-2 text-amber-200">
                <input
                  type="checkbox"
                  checked={newConfirmLossyOnly}
                  onChange={(event) => setNewConfirmLossyOnly(event.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  I confirm this release currently has no lossless masters and should show a quality
                  disclosure.
                </span>
              </label>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex justify-end">
          <button
            type="submit"
            disabled={
              createPending ||
              coverUploadTarget === "new" ||
              activeArtists.length === 0 ||
              (newMarkLossyOnly && !newConfirmLossyOnly)
            }
            className={primaryButtonClassName}
          >
            {createPending ? "Creating..." : "Create Release"}
          </button>
        </div>

        {activeArtists.length === 0 ? (
          <p className="mt-3 text-xs text-amber-300">
            Create at least one active artist before creating releases.
          </p>
        ) : null}
      </form>
  );
}
