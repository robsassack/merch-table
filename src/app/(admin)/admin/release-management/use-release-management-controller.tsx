import { useCallback, useEffect, useRef, useState } from "react";

import { createReleaseActions } from "./use-release-management-release-actions";
import { createTrackEditActions } from "./use-release-management-track-edit-actions";
import { createTrackImportUploadActions } from "./use-release-management-track-import-upload-actions";
import {
  applyTrackPatchToReleaseState,
  replaceReleaseState,
} from "./release-management-state-updaters";
import { recoverStuckTranscodeJobs } from "./release-management-recover-stuck";
import { useReleaseManagementFeaturedReleaseSync } from "./use-release-management-featured-release-sync";
import { renderReleasePricingDetails } from "./release-management-pricing-details";
import { syncReleaseDraftState, syncReleaseTrackState } from "./release-management-sync";
import { useReleaseManagementState } from "./use-release-management-state";
import type {
  ReleaseDraft, ReleaseRecord, ReleasesListResponse,
  TranscodeTasksStatusResponse, TrackRecordPatch,
} from "./types";
import {
  centsToDecimalString,
  withReleaseDerivedTrackStats,
} from "./utils";

export function useReleaseManagementController() {
  const TRANSCODE_POLL_INTERVAL_MS = 4_000;
  const TASKS_STATUS_POLL_INTERVAL_MS = 10_000;

  const state = useReleaseManagementState();
  const {
    releases,
    loading,
    setTasksLoading,
    setTasksError,
    tasksStatus,
    setTasksStatus,
    tasksLoading,
    tasksError,
    minimumPriceFloorCents,
    setDraftsById,
    setTrackDraftsById,
    setNewTrackByReleaseId,
    setTrackUploadRoleById,
    setExpandedTrackIdByReleaseId,
    setDraggingTrackIdByReleaseId,
    setDragOverTrackIdByReleaseId,
    setPreviewByReleaseId,
    setLoading,
    setError,
    setNotice,
    setReleases,
    setArtists,
    setMinimumPriceFloorCents,
    setStoreCurrency,
    setFeaturedReleaseId,
    setStripeFeePercentBps,
    setStripeFeeFixedCents,
    setNewArtistId,
    setNewPricingMode,
    setNewMinimumPrice,
    setNewAllowFreeCheckout,
    setNewStatus,
    setNewReleaseType,
    setNewLabel,
    setNewReleaseLabelDefault,
    setCreateDefaultArtistId,
    setCreateDefaultPricingMode,
    setCreateDefaultStatus,
    setCreateDefaultReleaseType,
    setCreateDefaultPwywMinimum,
    setCreateDefaultAllowFreeCheckout,
    setCreateDefaultPreviewMode,
    setCreateDefaultPreviewSeconds,
    setSelectedReleaseId,
    setCreateComposerOpen,
  } = state;
  const pollingInFlightRef = useRef(false);
  const createDefaultsInitializedRef = useRef(false);
  const [recoverStuckPending, setRecoverStuckPending] = useState(false);
  const [pendingFeaturedReleaseId, setPendingFeaturedReleaseId] = useState<string | null>(null);

  const hasActiveTranscodeJobs = releases.some((release) =>
    release.tracks.some((track) =>
      track.transcodeJobs.some((job) => job.status === "QUEUED" || job.status === "RUNNING"),
    ),
  );
  const syncDrafts = useCallback((list: ReleaseRecord[]) => {
    syncReleaseDraftState(list, setDraftsById);
  }, [setDraftsById]);

  const syncTrackDrafts = useCallback((list: ReleaseRecord[]) => {
    syncReleaseTrackState(list, {
      setTrackDraftsById,
      setNewTrackByReleaseId,
      setTrackUploadRoleById,
      setExpandedTrackIdByReleaseId,
      setDraggingTrackIdByReleaseId,
      setDragOverTrackIdByReleaseId,
      setPreviewByReleaseId,
    });
  }, [
    setTrackDraftsById,
    setNewTrackByReleaseId,
    setTrackUploadRoleById,
    setExpandedTrackIdByReleaseId,
    setDraggingTrackIdByReleaseId,
    setDragOverTrackIdByReleaseId,
    setPreviewByReleaseId,
  ]);

  const loadReleases = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;

    if (!silent) {
      setLoading(true);
      setError(null);
    }

    try {
      const response = await fetch("/api/admin/releases", { method: "GET" });
      const body = (await response.json().catch(() => null)) as ReleasesListResponse | null;
      if (!response.ok || !body?.ok || !body.releases || !body.artists) {
        throw new Error(body?.error ?? "Could not load releases.");
      }

      const hydratedReleases = body.releases.map((release) =>
        withReleaseDerivedTrackStats(release),
      );
      setReleases(hydratedReleases);
      setArtists(body.artists);
      syncDrafts(hydratedReleases);
      syncTrackDrafts(hydratedReleases);
      setMinimumPriceFloorCents(body.minimumPriceFloorCents ?? 50);
      setStoreCurrency(body.storeCurrency ?? "USD");
      setFeaturedReleaseId(body.featuredReleaseId ?? null);
      setStripeFeePercentBps(body.stripeFeeEstimate?.percentBps ?? 290);
      setStripeFeeFixedCents(body.stripeFeeEstimate?.fixedFeeCents ?? 30);
      const defaultReleaseLabel =
        typeof body.orgName === "string" && body.orgName.trim().length > 0
          ? body.orgName.trim()
          : "Independent";
      setNewReleaseLabelDefault(defaultReleaseLabel);
      setNewLabel((current) =>
        current.trim().length === 0 || current === "Independent" ? defaultReleaseLabel : current,
      );
      const artistList = body.artists;
      const firstActiveArtist = artistList.find((artist) => artist.deletedAt === null);
      const defaultArtistId =
        body.releaseDefaults?.artistId &&
        artistList.some(
          (artist) => artist.id === body.releaseDefaults?.artistId && artist.deletedAt === null,
        )
          ? body.releaseDefaults.artistId
          : null;
      const preferredArtistId = defaultArtistId ?? firstActiveArtist?.id ?? null;
      const defaultPricingMode = body.releaseDefaults?.pricingMode ?? "FREE";
      const defaultStatus = body.releaseDefaults?.status ?? "PUBLISHED";
      const defaultReleaseType = body.releaseDefaults?.type ?? "ALBUM";
      const defaultAllowFreeCheckout =
        body.releaseDefaults?.allowFreeCheckout === true && defaultPricingMode === "PWYW";
      const defaultPwywMinimum = (() => {
        if (typeof body.releaseDefaults?.pwywMinimumCents === "number") {
          return centsToDecimalString(
            body.releaseDefaults.pwywMinimumCents,
            body.storeCurrency ?? "USD",
          );
        }

        return defaultAllowFreeCheckout
          ? centsToDecimalString(0, body.storeCurrency ?? "USD")
          : "";
      })();
      const defaultPreviewMode = body.releaseDefaults?.previewMode ?? "CLIP";
      const defaultPreviewSeconds = String(body.releaseDefaults?.previewSeconds ?? 30);

      setCreateDefaultArtistId(preferredArtistId);
      setCreateDefaultPricingMode(defaultPricingMode);
      setCreateDefaultStatus(defaultStatus);
      setCreateDefaultReleaseType(defaultReleaseType);
      setCreateDefaultPwywMinimum(defaultPwywMinimum);
      setCreateDefaultAllowFreeCheckout(defaultAllowFreeCheckout);
      setCreateDefaultPreviewMode(defaultPreviewMode);
      setCreateDefaultPreviewSeconds(defaultPreviewSeconds);

      if (!createDefaultsInitializedRef.current) {
        createDefaultsInitializedRef.current = true;
        setNewPricingMode(defaultPricingMode);
        setNewStatus(defaultStatus);
        setNewReleaseType(defaultReleaseType);
        setNewMinimumPrice(defaultPricingMode === "PWYW" ? defaultPwywMinimum : "");
        setNewAllowFreeCheckout(defaultPricingMode === "PWYW" ? defaultAllowFreeCheckout : false);
      }

      setNewArtistId((current) => {
        if (current.length > 0) {
          return current;
        }

        return preferredArtistId ?? current;
      });
    } catch (loadError) {
      if (!silent) {
        setError(loadError instanceof Error ? loadError.message : "Could not load releases.");
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [
    setLoading,
    setError,
    setReleases,
    setArtists,
    syncDrafts,
    syncTrackDrafts,
    setMinimumPriceFloorCents,
    setStoreCurrency,
    setFeaturedReleaseId,
    setStripeFeePercentBps,
    setStripeFeeFixedCents,
    setNewArtistId,
    setNewPricingMode,
    setNewMinimumPrice,
    setNewAllowFreeCheckout,
    setNewStatus,
    setNewReleaseType,
    setNewLabel,
    setNewReleaseLabelDefault,
    setCreateDefaultArtistId,
    setCreateDefaultPricingMode,
    setCreateDefaultStatus,
    setCreateDefaultReleaseType,
    setCreateDefaultPwywMinimum,
    setCreateDefaultAllowFreeCheckout,
    setCreateDefaultPreviewMode,
    setCreateDefaultPreviewSeconds,
  ]);

  useEffect(() => {
    void loadReleases();
  }, [loadReleases]);

  const loadTasksStatus = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;

    if (!silent) {
      setTasksLoading(true);
      setTasksError(null);
    }

    try {
      const response = await fetch("/api/admin/transcode-status", { method: "GET" });
      const body = (await response.json().catch(() => null)) as TranscodeTasksStatusResponse | null;
      if (!response.ok || !body?.ok || !body.status) {
        throw new Error(body?.error ?? "Could not load tasks status.");
      }

      setTasksStatus(body.status);
      setTasksError(null);
    } catch (loadError) {
      if (!silent) {
        setTasksError(
          loadError instanceof Error ? loadError.message : "Could not load tasks status.",
        );
      }
    } finally {
      if (!silent) {
        setTasksLoading(false);
      }
    }
  }, [setTasksLoading, setTasksError, setTasksStatus]);

  useEffect(() => {
    void loadTasksStatus();
  }, [loadTasksStatus]);

  useEffect(() => {
    if (!hasActiveTranscodeJobs) {
      return;
    }

    let isCancelled = false;
    const runPoll = async () => {
      if (isCancelled || typeof document === "undefined") {
        return;
      }

      if (document.visibilityState !== "visible") {
        return;
      }

      if (pollingInFlightRef.current) {
        return;
      }

      pollingInFlightRef.current = true;
      try {
        await loadReleases({ silent: true });
      } finally {
        pollingInFlightRef.current = false;
      }
    };

    const intervalId = window.setInterval(() => {
      void runPoll();
    }, TRANSCODE_POLL_INTERVAL_MS);

    void runPoll();

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
      pollingInFlightRef.current = false;
    };
  }, [hasActiveTranscodeJobs, loadReleases]);

  useEffect(() => {
    let isCancelled = false;
    const runPoll = async () => {
      if (isCancelled || typeof document === "undefined") {
        return;
      }

      if (document.visibilityState !== "visible") {
        return;
      }

      await loadTasksStatus({ silent: true });
    };

    const intervalId = window.setInterval(() => {
      void runPoll();
    }, TASKS_STATUS_POLL_INTERVAL_MS);

    void runPoll();

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [loadTasksStatus]);

  const onRecoverStuckJobs = useCallback(
    async () =>
      recoverStuckTranscodeJobs({
        setError,
        setTasksError,
        setNotice,
        setRecoverStuckPending,
        loadTasksStatus,
        loadReleases,
      }),
    [loadReleases, loadTasksStatus, setError, setNotice, setTasksError],
  );

  useEffect(() => {
    setSelectedReleaseId((current) => {
      if (releases.length === 0) {
        return null;
      }

      if (current && releases.some((release) => release.id === current)) {
        return current;
      }

      return releases[0].id;
    });
  }, [releases, setSelectedReleaseId]);

  useEffect(() => {
    if (!loading && releases.length === 0) {
      setCreateComposerOpen(true);
    }
  }, [loading, releases.length, setCreateComposerOpen]);

  const replaceRelease = useCallback((updated: ReleaseRecord) => {
    replaceReleaseState({
      updated,
      setReleases,
      setDraftsById,
      setTrackDraftsById,
      setNewTrackByReleaseId,
      setPreviewByReleaseId,
    });
  }, [
    setDraftsById,
    setNewTrackByReleaseId,
    setPreviewByReleaseId,
    setReleases,
    setTrackDraftsById,
  ]);

  const applyTrackPatchToRelease = useCallback((releaseId: string, track: TrackRecordPatch) => {
    applyTrackPatchToReleaseState({
      releaseId,
      track,
      setReleases,
      setTrackDraftsById,
    });
  }, [setReleases, setTrackDraftsById]);

  const {
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
  } = createReleaseActions({
    ...state,
    replaceRelease,
  });

  const { onImportTrackFiles, onResolveImportConflict, onInlineTrackFileChange } =
    createTrackImportUploadActions({
      ...state,
      loadReleases,
    });

  const {
    onApplyReleasePreviewToTracks,
    onCreateTrack,
    onUpdateTrack,
    onReorderTrackDrop,
    onDeleteTrack,
    onRequeueTrackFailedTranscodes,
  } = createTrackEditActions({
    ...state,
    loadReleases,
    applyTrackPatchToRelease,
  });

  const renderPricingDetails = (draft: ReleaseDraft, currency: string) =>
    renderReleasePricingDetails({
      draft,
      currency,
      minimumPriceFloorCents,
      getPricingEstimate,
    });

  const { onSetFeaturedRelease } = useReleaseManagementFeaturedReleaseSync({
    featuredReleaseId: state.featuredReleaseId,
    releases,
    pendingFeaturedReleaseId,
    setPendingFeaturedReleaseId,
    setFeaturedReleaseId,
    setError,
    setNotice,
  });

  return {
    ...state,
    tasksStatus,
    tasksLoading,
    tasksError,
    recoverStuckPending,
    pendingFeaturedReleaseId,
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
    onRecoverStuckJobs,
    onImportTrackFiles,
    onResolveImportConflict,
    onApplyReleasePreviewToTracks,
    onCreateTrack,
    onUpdateTrack,
    onReorderTrackDrop,
    onDeleteTrack,
    onRequeueTrackFailedTranscodes,
    onInlineTrackFileChange,
    getPricingEstimate,
    renderPricingDetails,
    newCoverPreviewSrc,
    onSetFeaturedRelease,
  };
}

export type ReleaseManagementController = ReturnType<typeof useReleaseManagementController>;
