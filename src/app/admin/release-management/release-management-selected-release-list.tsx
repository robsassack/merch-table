import {
  buttonClassName,
  deliveryFormatOptions,
  pricingModeOptions,
  statusOptions,
} from "./constants";
import { ReleaseManagementReleaseFooter } from "./release-management-release-footer";
import { ReleaseManagementStorefrontPreview } from "./release-management-storefront-preview";
import { ReleaseManagementTrackManagement } from "./release-management-track-management";
import type { DeliveryFormat, PricingMode, ReleaseStatus } from "./types";
import type { ReleaseManagementController } from "./use-release-management-controller";
import {
  getReleaseUrlPreview,
  sanitizeUrlInput,
  toCoverDisplaySrc,
  toReleaseDraft,
} from "./utils";

export function ReleaseManagementSelectedReleaseList(props: {
  controller: ReleaseManagementController;
}) {
  const {
    artists,
    releases,
    draftsById,
    setDraftsById,
    pendingReleaseId,
    pendingTrackReorderReleaseId,
    pendingPreviewApplyReleaseId,
    pendingTrackImportReleaseId,
    advancedById,
    createPending,
    coverUploadTarget,
    selectedReleaseId,
    localCoverPreviewById,
    setLocalCoverPreviewForRelease,
    onExistingCoverFileChange,
    renderPricingDetails,
    getPricingEstimate,
  } = props.controller;

  return (
        <div className="mt-5 space-y-4">
          {releases.filter((release) => release.id === selectedReleaseId).map((release) => {
            const draft = draftsById[release.id] ?? toReleaseDraft(release);
            const isPending = pendingReleaseId === release.id;
            const importTrackPending = pendingTrackImportReleaseId === release.id;
            const previewApplyPending = pendingPreviewApplyReleaseId === release.id;
            const reorderTrackPending = pendingTrackReorderReleaseId === release.id;
            const latestTrackUpdatedAt = release.tracks.reduce<string | null>(
              (latest, track) => {
                if (!latest) {
                  return track.updatedAt;
                }

                return new Date(track.updatedAt).getTime() > new Date(latest).getTime()
                  ? track.updatedAt
                  : latest;
              },
              null,
            );
            const estimate = getPricingEstimate(draft, release.currency || "USD");
            const existingCoverPreviewSrc =
              localCoverPreviewById[release.id] ?? draft.coverImageUrl;

            return (
              <article
                key={release.id}
                className="overflow-x-clip rounded-xl border border-slate-700 p-3 sm:p-4"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h3 className="min-w-0 break-words text-sm font-semibold text-zinc-100">
                      {release.title}
                    </h3>
                    {release.deletedAt ? (
                      <span className="rounded-full border border-amber-700/70 bg-amber-950/50 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                        deleted
                      </span>
                    ) : null}
                    {release.qualityDisclosureRequired ? (
                      <span className="rounded-full border border-rose-700/70 bg-rose-950/40 px-2 py-0.5 text-[11px] font-medium text-rose-300">
                        quality disclosure
                      </span>
                    ) : null}
                  </div>

                  <p className="text-xs text-zinc-500 sm:text-right">
                    {release._count.tracks} tracks • {release._count.files} files • {release._count.orderItems} orders
                  </p>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs text-zinc-500 md:col-span-2">
                    Artist
                    <select
                      value={draft.artistId}
                      onChange={(event) =>
                        setDraftsById((previous) => ({
                          ...previous,
                          [release.id]: { ...draft, artistId: event.target.value },
                        }))
                      }
                      className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
                    >
                      {artists.map((artist) => (
                        <option
                          key={artist.id}
                          value={artist.id}
                          disabled={artist.deletedAt !== null && artist.id !== release.artistId}
                        >
                          {artist.name}
                          {artist.deletedAt ? " (deleted)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-xs text-zinc-500 md:col-span-2">
                    Title
                    <input
                      required
                      maxLength={160}
                      value={draft.title}
                      onChange={(event) =>
                        setDraftsById((previous) => ({
                          ...previous,
                          [release.id]: { ...draft, title: event.target.value },
                        }))
                      }
                      className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
                    />
                  </label>

                  {advancedById[release.id] ? (
                    <label className="flex flex-col gap-1 text-xs text-zinc-500 md:col-span-2">
                      URL
                      <input
                        maxLength={160}
                        value={draft.slug}
                        onChange={(event) =>
                          setDraftsById((previous) => ({
                            ...previous,
                            [release.id]: {
                              ...draft,
                              slug: sanitizeUrlInput(event.target.value),
                            },
                          }))
                        }
                        className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
                      />
                      <span className="rm-break-anywhere text-[11px] text-zinc-500">
                        Preview: {getReleaseUrlPreview(draft.title, draft.slug)}
                      </span>
                    </label>
                  ) : null}

                  <label className="flex flex-col gap-1 text-xs text-zinc-500 md:col-span-2">
                    Description
                    <textarea
                      rows={3}
                      maxLength={4_000}
                      value={draft.description}
                      onChange={(event) =>
                        setDraftsById((previous) => ({
                          ...previous,
                          [release.id]: { ...draft, description: event.target.value },
                        }))
                      }
                      className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
                    />
                  </label>

                  <div className="rounded-lg border border-slate-700/80 bg-slate-900/50 p-3 text-xs text-zinc-400 md:col-span-2">
                    <p className="font-medium text-zinc-300">Cover artwork</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <label className={buttonClassName}>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
                          className="hidden"
                          onChange={(event) => void onExistingCoverFileChange(release.id, event)}
                          disabled={isPending || createPending || coverUploadTarget === release.id}
                        />
                        {coverUploadTarget === release.id ? "Uploading..." : "Upload Cover"}
                      </label>
                      <button
                        type="button"
                        className={buttonClassName}
                        disabled={
                          isPending ||
                          createPending ||
                          coverUploadTarget === release.id ||
                          existingCoverPreviewSrc.length === 0
                        }
                        onClick={() => {
                          setLocalCoverPreviewForRelease(release.id, null);
                          setDraftsById((previous) => ({
                            ...previous,
                            [release.id]: {
                              ...draft,
                              coverImageUrl: "",
                              coverStorageKey: null,
                              removeCoverImage: true,
                            },
                          }));
                        }}
                      >
                        Remove Cover
                      </button>
                    </div>

                    {existingCoverPreviewSrc ? (
                      <div className="mt-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={toCoverDisplaySrc(existingCoverPreviewSrc)}
                          alt={`${draft.title} cover preview`}
                          className="h-24 w-24 rounded-lg border border-slate-700 object-cover"
                        />
                      </div>
                    ) : (
                      <p className="mt-3 text-xs text-zinc-500">No cover artwork.</p>
                    )}
                  </div>

                  <label className="flex flex-col gap-1 text-xs text-zinc-500">
                    Pricing mode
                    <select
                      value={draft.pricingMode}
                      onChange={(event) => {
                        const value = event.target.value as PricingMode;
                        setDraftsById((previous) => ({
                          ...previous,
                          [release.id]: {
                            ...draft,
                            pricingMode: value,
                            allowFreeCheckout:
                              value === "PWYW" ? draft.allowFreeCheckout : false,
                          },
                        }));
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
                      value={draft.status}
                      onChange={(event) =>
                        setDraftsById((previous) => ({
                          ...previous,
                          [release.id]: {
                            ...draft,
                            status: event.target.value as ReleaseStatus,
                          },
                        }))
                      }
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
                      value={draft.releaseDate}
                      onChange={(event) =>
                        setDraftsById((previous) => ({
                          ...previous,
                          [release.id]: {
                            ...draft,
                            releaseDate: event.target.value,
                          },
                        }))
                      }
                      className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
                    />
                  </label>

                  {draft.pricingMode === "FIXED" ? (
                    <label className="flex flex-col gap-1 text-xs text-zinc-500 md:col-span-2">
                      Fixed price ({release.currency})
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        value={draft.fixedPrice}
                        onChange={(event) =>
                          setDraftsById((previous) => ({
                            ...previous,
                            [release.id]: {
                              ...draft,
                              fixedPrice: event.target.value,
                            },
                          }))
                        }
                        className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
                      />
                    </label>
                  ) : null}

                  {draft.pricingMode === "PWYW" ? (
                    <div className="flex flex-col gap-2 text-xs text-zinc-500 md:col-span-2">
                      <label className="flex flex-col gap-1">
                        PWYW minimum ({release.currency})
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          value={draft.minimumPrice}
                          onChange={(event) =>
                            setDraftsById((previous) => ({
                              ...previous,
                              [release.id]: {
                                ...draft,
                                minimumPrice: event.target.value,
                              },
                            }))
                          }
                          className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
                          placeholder={draft.allowFreeCheckout ? "0.00" : "2.00"}
                        />
                      </label>
                      <label className="inline-flex items-center gap-2 text-zinc-300">
                        <input
                          type="checkbox"
                          checked={draft.allowFreeCheckout}
                          onChange={(event) =>
                            setDraftsById((previous) => ({
                              ...previous,
                              [release.id]: {
                                ...draft,
                                allowFreeCheckout: event.target.checked,
                                minimumPrice:
                                  event.target.checked && draft.minimumPrice.trim().length === 0
                                    ? "0.00"
                                    : draft.minimumPrice,
                              },
                            }))
                          }
                        />
                        Allow free checkout ($0)
                      </label>
                    </div>
                  ) : null}

                  <div className="rounded-lg border border-slate-700/80 bg-slate-900/50 p-3 text-xs text-zinc-400 md:col-span-2">
                    <p className="font-medium text-zinc-300">Pricing estimate</p>
                    {renderPricingDetails(draft, release.currency || "USD")}
                  </div>

                  <div className="rounded-lg border border-slate-700/80 bg-slate-900/50 p-3 text-xs text-zinc-400 md:col-span-2">
                    <p className="font-medium text-zinc-300">Master quality workflow</p>
                    <p className="mt-1">
                      Release assets tracked: {release.trackAssetCount}. Lossless masters detected: {release.hasLosslessMasters ? "yes" : "no"}.
                    </p>

                    <div className="mt-3 flex flex-col gap-2">
                      <label className="inline-flex items-start gap-2">
                        <input
                          type="radio"
                          name={`lossless-${release.id}`}
                          checked={!draft.markLossyOnly}
                          onChange={() =>
                            setDraftsById((previous) => ({
                              ...previous,
                              [release.id]: {
                                ...draft,
                                markLossyOnly: false,
                                confirmLossyOnly: false,
                              },
                            }))
                          }
                          className="mt-0.5"
                        />
                        <span className="text-zinc-300">Lossless masters</span>
                      </label>
                      <label className="inline-flex items-start gap-2">
                        <input
                          type="radio"
                          name={`lossless-${release.id}`}
                          checked={draft.markLossyOnly}
                          onChange={() =>
                            setDraftsById((previous) => ({
                              ...previous,
                              [release.id]: {
                                ...draft,
                                markLossyOnly: true,
                                confirmLossyOnly: false,
                              },
                            }))
                          }
                          className="mt-0.5"
                        />
                        <span className="text-zinc-300">Lossy masters</span>
                      </label>
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-700/80 bg-slate-900/50 p-3 text-xs text-zinc-400 md:col-span-2">
                    <p className="font-medium text-zinc-300">Download formats</p>
                    <p className="mt-1">
                      Choose which transcode formats are available for buyer downloads.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-3">
                      {deliveryFormatOptions.map((formatOption) => {
                        const checked = draft.deliveryFormats.includes(formatOption.value);

                        return (
                          <label
                            key={formatOption.value}
                            className="inline-flex items-center gap-2 text-zinc-300"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(event) => {
                                const nextFormats: DeliveryFormat[] = event.target.checked
                                  ? Array.from(
                                      new Set<DeliveryFormat>([
                                        ...draft.deliveryFormats,
                                        formatOption.value,
                                      ]),
                                    )
                                  : draft.deliveryFormats.filter(
                                      (value) => value !== formatOption.value,
                                    );

                                setDraftsById((previous) => ({
                                  ...previous,
                                  [release.id]: {
                                    ...draft,
                                    deliveryFormats: nextFormats,
                                  },
                                }));
                              }}
                            />
                            <span>{formatOption.label}</span>
                          </label>
                        );
                      })}
                    </div>
                    {draft.deliveryFormats.length === 0 ? (
                      <p className="mt-2 text-xs text-amber-300">
                        Select at least one delivery format before saving.
                      </p>
                    ) : null}
                  </div>


                  <ReleaseManagementTrackManagement
                    controller={props.controller}
                    release={release}
                    draft={draft}
                    isPending={isPending}
                    importTrackPending={importTrackPending}
                    previewApplyPending={previewApplyPending}
                    reorderTrackPending={reorderTrackPending}
                  />

                  <ReleaseManagementStorefrontPreview release={release} />
                </div>

                  <ReleaseManagementReleaseFooter
                    controller={props.controller}
                    release={release}
                    draft={draft}
                    isPending={isPending}
                    estimate={estimate}
                    latestTrackUpdatedAt={latestTrackUpdatedAt}
                  />
              </article>
            );
          })}
        </div>
  );
}
