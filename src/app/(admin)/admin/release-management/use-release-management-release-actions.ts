import type { ChangeEvent, FormEvent } from "react";

import {
  estimateNetPayoutCents,
  estimateStripeFeeCents,
} from "@/lib/pricing/pricing-rules";

import { uploadReleaseCoverFile } from "./release-cover-upload";
import { createReleaseTranscodeActions } from "./use-release-management-release-transcode-actions";
import type { ReleaseManagementState } from "./use-release-management-state";
import type { ReleaseDraft, ReleaseMutationResponse, ReleaseRecord } from "./types";
import {
  formatCurrency,
  getMutationError,
  getTodayDateInputValue,
  parseCurrencyInputToCents,
  toNewTrackDraft,
  toReleaseDraft,
  withReleaseDerivedTrackStats,
} from "./utils";

type ReleaseActionsInput = ReleaseManagementState & {
  replaceRelease: (updated: ReleaseRecord) => void;
};

export function createReleaseActions(input: ReleaseActionsInput) {
  const {
    releases,
    draftsById,
    minimumPriceFloorCents,
    stripeFeeEstimateConfig,
    trackLocalObjectUrl,
    setNewCoverPreviewUrl,
    revokeLocalObjectUrl,
    setError,
    setNotice,
    setCoverUploadTarget,
    setNewCoverStorageKey,
    setNewCoverImageUrl,
    setLocalCoverPreviewForRelease,
    setDraftsById,
    setCreatePending,
    setNewArtistId,
    newArtistId,
    newTitle,
    newSlug,
    newReleaseLabelDefault,
    newLabel,
    newDescription,
    newCoverStorageKey,
    newPricingMode,
    newFixedPrice,
    newMinimumPrice,
    newDeliveryFormats,
    newAllowFreeCheckout,
    newStatus,
    newReleaseType,
    newReleaseDate,
    createDefaultArtistId,
    createDefaultPricingMode,
    createDefaultStatus,
    createDefaultReleaseType,
    createDefaultPwywMinimum,
    createDefaultAllowFreeCheckout,
    createDefaultPreviewMode,
    createDefaultPreviewSeconds,
    newMarkLossyOnly,
    newConfirmLossyOnly,
    setReleases,
    setNewTrackByReleaseId,
    setNewTitle,
    setNewSlug,
    setNewLabel,
    setNewDescription,
    setNewAllowFreeCheckout,
    setNewStatus,
    setNewReleaseType,
    setNewReleaseDate,
    setNewMarkLossyOnly,
    setNewConfirmLossyOnly,
    setNewUrlTouched,
    setCreateAdvancedOpen,
    setCreateComposerOpen,
    setSelectedReleaseId,
    setNewPricingMode,
    setNewFixedPrice,
    setNewMinimumPrice,
    setNewDeliveryFormats,
    setPendingReleaseId,
    setTrackDraftsById,
    setTrackImportJobsByReleaseId,
    setExpandedTrackIdByReleaseId,
    setDraggingTrackIdByReleaseId,
    setDragOverTrackIdByReleaseId,
    setPreviewByReleaseId,
    setPurgeDialogRelease,
    setPurgeConfirmInput,
    newCoverPreviewUrl,
    newCoverImageUrl,
    replaceRelease,
  } = input;

  const onNewCoverFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    trackLocalObjectUrl(objectUrl);
    setNewCoverPreviewUrl((previous) => {
      if (previous && previous !== objectUrl) {
        revokeLocalObjectUrl(previous);
      }
      return objectUrl;
    });

    setError(null);
    setNotice(null);
    setCoverUploadTarget("new");

    try {
      const uploaded = await uploadReleaseCoverFile(file);
      setNewCoverStorageKey(uploaded.storageKey);
      setNewCoverImageUrl(uploaded.publicUrl);
      setNotice(`Uploaded cover artwork "${file.name}".`);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Could not upload cover artwork.",
      );
    } finally {
      setCoverUploadTarget(null);
    }
  };

  const onExistingCoverFileChange = async (
    releaseId: string,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    const draft = draftsById[releaseId];
    if (!draft) {
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    trackLocalObjectUrl(objectUrl);
    setLocalCoverPreviewForRelease(releaseId, objectUrl);

    setError(null);
    setNotice(null);
    setCoverUploadTarget(releaseId);

    try {
      const uploaded = await uploadReleaseCoverFile(file);
      setDraftsById((previous) => ({
        ...previous,
        [releaseId]: {
          ...draft,
          coverImageUrl: uploaded.publicUrl,
          coverStorageKey: uploaded.storageKey,
          removeCoverImage: false,
        },
      }));
      setNotice(`Uploaded cover artwork "${file.name}".`);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Could not upload cover artwork.",
      );
    } finally {
      setCoverUploadTarget(null);
    }
  };

  const getPricingEstimate = (draft: ReleaseDraft, currency: string) => {
    const source = draft.pricingMode === "FIXED" ? draft.fixedPrice : draft.minimumPrice;
    const grossCents = parseCurrencyInputToCents(source, currency);

    if (draft.pricingMode === "FREE" || grossCents === null || grossCents <= 0) {
      return null;
    }

    const feeCents = estimateStripeFeeCents(grossCents, stripeFeeEstimateConfig);
    const netCents = estimateNetPayoutCents(grossCents, stripeFeeEstimateConfig);

    return {
      grossCents,
      feeCents,
      netCents,
      grossLabel: formatCurrency(grossCents, currency),
      feeLabel: formatCurrency(feeCents, currency),
      netLabel: formatCurrency(netCents, currency),
      belowFloor:
        grossCents < minimumPriceFloorCents &&
        !(draft.pricingMode === "PWYW" && draft.allowFreeCheckout && grossCents === 0),
    };
  };

  const onCreateRelease = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setCreatePending(true);

    try {
      const response = await fetch("/api/admin/releases", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          artistId: newArtistId,
          title: newTitle,
          releaseType: newReleaseType,
          label: newLabel,
          slug: newSlug.length > 0 ? newSlug : undefined,
          description: newDescription.length > 0 ? newDescription : null,
          coverStorageKey: newCoverStorageKey,
          pricingMode: newPricingMode,
          fixedPriceCents:
            newPricingMode === "FIXED"
              ? parseCurrencyInputToCents(newFixedPrice, input.storeCurrency)
              : null,
          minimumPriceCents:
            newPricingMode === "PWYW"
              ? (parseCurrencyInputToCents(newMinimumPrice, input.storeCurrency) ??
                (newAllowFreeCheckout ? 0 : null))
              : null,
          deliveryFormats: newDeliveryFormats,
          allowFreeCheckout: newPricingMode === "PWYW" ? newAllowFreeCheckout : false,
          status: newStatus,
          releaseDate: newReleaseDate,
          markLossyOnly: newMarkLossyOnly,
          confirmLossyOnly: newConfirmLossyOnly,
        }),
      });
      const body = (await response.json().catch(() => null)) as ReleaseMutationResponse | null;
      if (!response.ok || !body?.ok || !body.release) {
        throw new Error(getMutationError(body, "Could not create release."));
      }

      const createdRelease = withReleaseDerivedTrackStats(body.release);
      setReleases((previous) => [createdRelease, ...previous]);
      setDraftsById((previous) => ({
        ...previous,
        [createdRelease.id]: toReleaseDraft(createdRelease),
      }));
      setNewTrackByReleaseId((previous) => ({
        ...previous,
        [createdRelease.id]: toNewTrackDraft(createdRelease),
      }));

      setNewTitle("");
      setNewSlug("");
      setNewLabel(newReleaseLabelDefault);
      setNewDescription("");
      setNewCoverImageUrl("");
      setNewCoverPreviewUrl((previous) => {
        revokeLocalObjectUrl(previous);
        return null;
      });
      setNewCoverStorageKey(null);
      setNewArtistId(createDefaultArtistId ?? newArtistId);
      setNewPricingMode(createDefaultPricingMode);
      setNewFixedPrice("");
      setNewMinimumPrice(createDefaultPricingMode === "PWYW" ? createDefaultPwywMinimum : "");
      setNewDeliveryFormats(["MP3", "M4A", "FLAC"]);
      setNewAllowFreeCheckout(
        createDefaultPricingMode === "PWYW" ? createDefaultAllowFreeCheckout : false,
      );
      setNewStatus(createDefaultStatus);
      setNewReleaseType(createDefaultReleaseType);
      setNewReleaseDate(getTodayDateInputValue());
      setNewMarkLossyOnly(false);
      setNewConfirmLossyOnly(false);
      setNewUrlTouched(false);
      setCreateAdvancedOpen(false);
      setCreateComposerOpen(false);
      setSelectedReleaseId(createdRelease.id);
      setPreviewByReleaseId((previous) => ({
        ...previous,
        [createdRelease.id]: {
          previewMode: createDefaultPreviewMode,
          previewSeconds:
            createDefaultPreviewMode === "CLIP" ? createDefaultPreviewSeconds : "30",
        },
      }));
      setNotice(`Created release "${createdRelease.title}".`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create release.");
    } finally {
      setCreatePending(false);
    }
  };

  const onUpdateRelease = async (releaseId: string) => {
    const draft = draftsById[releaseId];
    if (!draft) {
      return;
    }
    const releaseCurrency =
      releases.find((release) => release.id === releaseId)?.currency ?? input.storeCurrency;

    setError(null);
    setNotice(null);
    setPendingReleaseId(releaseId);

    try {
      const response = await fetch(`/api/admin/releases/${releaseId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "update",
          artistId: draft.artistId,
          featuredTrackId: draft.featuredTrackId,
          title: draft.title,
          releaseType: draft.releaseType,
          label: draft.label,
          slug: draft.slug.length > 0 ? draft.slug : undefined,
          description: draft.description.length > 0 ? draft.description : null,
          coverStorageKey: draft.coverStorageKey,
          removeCoverImage: draft.removeCoverImage,
          pricingMode: draft.pricingMode,
          fixedPriceCents:
            draft.pricingMode === "FIXED"
              ? parseCurrencyInputToCents(draft.fixedPrice, releaseCurrency)
              : null,
          minimumPriceCents:
            draft.pricingMode === "PWYW"
              ? (parseCurrencyInputToCents(draft.minimumPrice, releaseCurrency) ??
                (draft.allowFreeCheckout ? 0 : null))
              : null,
          deliveryFormats: draft.deliveryFormats,
          allowFreeCheckout: draft.pricingMode === "PWYW" ? draft.allowFreeCheckout : false,
          status: draft.status,
          releaseDate: draft.releaseDate,
          markLossyOnly: draft.markLossyOnly,
          confirmLossyOnly: draft.confirmLossyOnly,
        }),
      });
      const body = (await response.json().catch(() => null)) as ReleaseMutationResponse | null;
      if (!response.ok || !body?.ok || !body.release) {
        throw new Error(getMutationError(body, "Could not update release."));
      }

      replaceRelease(body.release);
      setNotice(`Saved "${body.release.title}".`);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update release.");
    } finally {
      setPendingReleaseId(null);
    }
  };

  const onSoftDeleteOrRestoreRelease = async (release: ReleaseRecord) => {
    setError(null);
    setNotice(null);
    setPendingReleaseId(release.id);

    try {
      const action = release.deletedAt ? "restore" : "soft-delete";
      const response = await fetch(`/api/admin/releases/${release.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = (await response.json().catch(() => null)) as ReleaseMutationResponse | null;
      if (!response.ok || !body?.ok || !body.release) {
        throw new Error(
          getMutationError(
            body,
            action === "restore" ? "Could not restore release." : "Could not delete release.",
          ),
        );
      }

      replaceRelease(body.release);
      setNotice(
        action === "restore"
          ? `Restored "${body.release.title}".`
          : `Soft-deleted "${body.release.title}".`,
      );
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not change release status.");
    } finally {
      setPendingReleaseId(null);
    }
  };

  const onPurgeRelease = async (release: ReleaseRecord, confirmTitle: string) => {
    setError(null);
    setNotice(null);
    setPendingReleaseId(release.id);

    try {
      const response = await fetch(`/api/admin/releases/${release.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "purge",
          confirmTitle,
        }),
      });

      const body = (await response.json().catch(() => null)) as ReleaseMutationResponse | null;
      if (!response.ok || !body?.ok || !body.release) {
        throw new Error(getMutationError(body, "Could not purge release assets."));
      }

      replaceRelease(body.release);
      setNotice(
        `Purged ${body.purgedAssetCount ?? 0} storage asset${body.purgedAssetCount === 1 ? "" : "s"} for "${release.title}".`,
      );
      setPurgeDialogRelease(null);
      setPurgeConfirmInput("");
    } catch (purgeError) {
      setError(
        purgeError instanceof Error ? purgeError.message : "Could not purge release assets.",
      );
    } finally {
      setPendingReleaseId(null);
    }
  };

  const onHardDeleteRelease = async (release: ReleaseRecord, confirmTitle: string) => {
    setError(null);
    setNotice(null);
    setPendingReleaseId(release.id);

    try {
      const response = await fetch(`/api/admin/releases/${release.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "hard-delete",
          confirmTitle,
        }),
      });

      const body = (await response.json().catch(() => null)) as ReleaseMutationResponse | null;
      if (!response.ok || !body?.ok || !body.hardDeletedReleaseId) {
        throw new Error(getMutationError(body, "Could not fully delete release."));
      }
      const hardDeletedReleaseId = body.hardDeletedReleaseId;

      setReleases((previous) => previous.filter((entry) => entry.id !== hardDeletedReleaseId));
      setDraftsById((previous) => {
        const next = { ...previous };
        delete next[hardDeletedReleaseId];
        return next;
      });
      setNewTrackByReleaseId((previous) => {
        const next = { ...previous };
        delete next[hardDeletedReleaseId];
        return next;
      });
      setTrackDraftsById((previous) => {
        const next = { ...previous };
        for (const track of release.tracks) {
          delete next[track.id];
        }
        return next;
      });
      setTrackImportJobsByReleaseId((previous) => {
        const next = { ...previous };
        delete next[hardDeletedReleaseId];
        return next;
      });
      setExpandedTrackIdByReleaseId((previous) => {
        const next = { ...previous };
        delete next[hardDeletedReleaseId];
        return next;
      });
      setDraggingTrackIdByReleaseId((previous) => {
        const next = { ...previous };
        delete next[hardDeletedReleaseId];
        return next;
      });
      setDragOverTrackIdByReleaseId((previous) => {
        const next = { ...previous };
        delete next[hardDeletedReleaseId];
        return next;
      });
      setPreviewByReleaseId((previous) => {
        const next = { ...previous };
        delete next[hardDeletedReleaseId];
        return next;
      });
      setNotice(
        `Fully deleted "${release.title}" and removed ${body.purgedAssetCount ?? 0} storage asset${body.purgedAssetCount === 1 ? "" : "s"}.`,
      );
      setPurgeDialogRelease(null);
      setPurgeConfirmInput("");
    } catch (hardDeleteError) {
      setError(
        hardDeleteError instanceof Error
          ? hardDeleteError.message
          : "Could not fully delete release.",
      );
    } finally {
      setPendingReleaseId(null);
    }
  };

  const {
    onGenerateDownloadFormats,
    onForceRequeueTranscodes,
    onRequeueFailedTranscodes,
    onCancelReleaseTranscodes,
  } = createReleaseTranscodeActions({
    setError,
    setNotice,
    setPendingReleaseId,
    replaceRelease,
  });

  const newCoverPreviewSrc = newCoverPreviewUrl ?? newCoverImageUrl;

  return {
    getPricingEstimate,
    onNewCoverFileChange,
    onExistingCoverFileChange,
    onCreateRelease,
    onUpdateRelease,
    onSoftDeleteOrRestoreRelease,
    onPurgeRelease,
    onHardDeleteRelease,
    onGenerateDownloadFormats,
    onRequeueFailedTranscodes,
    onForceRequeueTranscodes,
    onCancelReleaseTranscodes,
    newCoverPreviewSrc,
  };
}
