import { useCallback, useEffect, useRef, useState } from "react";

import { createReleaseActions } from "./use-release-management-release-actions";
import { createTrackEditActions } from "./use-release-management-track-edit-actions";
import { createTrackImportUploadActions } from "./use-release-management-track-import-upload-actions";
import { renderReleasePricingDetails } from "./release-management-pricing-details";
import { syncReleaseDraftState, syncReleaseTrackState } from "./release-management-sync";
import { useReleaseManagementState } from "./use-release-management-state";
import type {
  RecoverStuckTranscodesResponse, ReleaseDraft, ReleaseRecord, ReleasesListResponse,
  TranscodeTasksStatusResponse, TrackRecordPatch,
} from "./types";
import {
  centsToDecimalString, sortTracks, toNewTrackDraft, toReleaseDraft, toReleasePreviewDraft, toTrackDraft,
  withReleaseDerivedTrackStats,
} from "./utils";
import { resolveNormalizedFeaturedReleaseId } from "./featured-release";

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
          return centsToDecimalString(body.releaseDefaults.pwywMinimumCents);
        }

        return defaultAllowFreeCheckout ? "0.00" : "";
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

  const onRecoverStuckJobs = useCallback(async () => {
    setError(null);
    setTasksError(null);
    setRecoverStuckPending(true);

    try {
      const response = await fetch("/api/admin/transcode-status/recover-stuck", {
        method: "POST",
      });
      const body = (await response.json().catch(() => null)) as RecoverStuckTranscodesResponse | null;
      if (!response.ok || !body?.ok || !body.summary) {
        throw new Error(body?.error ?? "Could not recover stuck transcode jobs.");
      }

      const staleQueuedRecovered = body.summary.staleQueued.requeued;
      const staleRunningRecovered = body.summary.staleRunning.requeued;
      const retryEnqueued = body.summary.retryDue.enqueued;
      const totalRecoveries = staleQueuedRecovered + staleRunningRecovered + retryEnqueued;

      if (totalRecoveries === 0) {
        setNotice("No stuck transcode jobs were recovered.");
      } else {
        setNotice(
          `Recovered ${staleQueuedRecovered} stale queued, ${staleRunningRecovered} stale running, and re-enqueued ${retryEnqueued} retry job${retryEnqueued === 1 ? "" : "s"}.`,
        );
      }

      await Promise.all([
        loadTasksStatus({ silent: true }),
        loadReleases({ silent: true }),
      ]);
    } catch (error) {
      setTasksError(
        error instanceof Error ? error.message : "Could not recover stuck transcode jobs.",
      );
    } finally {
      setRecoverStuckPending(false);
    }
  }, [loadReleases, loadTasksStatus, setError, setNotice, setTasksError]);

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

  const replaceRelease = (updated: ReleaseRecord) => {
    const normalized = withReleaseDerivedTrackStats(updated);
    setReleases((previous) =>
      previous.map((release) => (release.id === normalized.id ? normalized : release)),
    );
    setDraftsById((previous) => ({
      ...previous,
      [normalized.id]: toReleaseDraft(normalized),
    }));
    setTrackDraftsById((previous) => {
      const next = { ...previous };
      for (const track of normalized.tracks) {
        next[track.id] = previous[track.id] ?? toTrackDraft(track);
      }
      return next;
    });
    setNewTrackByReleaseId((previous) => ({
      ...previous,
      [normalized.id]: previous[normalized.id] ?? toNewTrackDraft(normalized),
    }));
    setPreviewByReleaseId((previous) => ({
      ...previous,
      [normalized.id]: previous[normalized.id] ?? toReleasePreviewDraft(normalized),
    }));
  };

  const applyTrackPatchToRelease = (releaseId: string, track: TrackRecordPatch) => {
    let nextTracksForDraftSync: TrackRecordPatch[] | null = null;

    setReleases((previous) =>
      previous.map((release) => {
        if (release.id !== releaseId) {
          return release;
        }

        const sorted = sortTracks(release.tracks);
        const existingIndex = sorted.findIndex((entry) => entry.id === track.id);
        const withoutTrack =
          existingIndex >= 0
            ? sorted.filter((entry) => entry.id !== track.id)
            : [...sorted];

        const targetIndex = Math.max(
          0,
          Math.min(withoutTrack.length, track.trackNumber - 1),
        );
        const nextTracks = [
          ...withoutTrack.slice(0, targetIndex),
          track,
          ...withoutTrack.slice(targetIndex),
        ].map((entry, index) => ({
          ...entry,
          trackNumber: index + 1,
        }));
        nextTracksForDraftSync = nextTracks;

        return withReleaseDerivedTrackStats({
          ...release,
          tracks: nextTracks,
        });
      }),
    );

    setTrackDraftsById((previous) => {
      if (!nextTracksForDraftSync) {
        return {
          ...previous,
          [track.id]: toTrackDraft(track),
        };
      }

      const next = { ...previous };
      for (const nextTrack of nextTracksForDraftSync) {
        next[nextTrack.id] = toTrackDraft(nextTrack);
      }
      return next;
    });
  };

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

  const onSetFeaturedRelease = useCallback(async (releaseId: string) => {
    setError(null);
    setNotice(null);
    setPendingFeaturedReleaseId(releaseId);

    try {
      const response = await fetch("/api/admin/settings/store", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ featuredReleaseId: releaseId }),
      });
      const body = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
            data?: { featuredReleaseId?: string | null };
          }
        | null;

      if (!response.ok || !body?.ok || !body.data) {
        throw new Error(body?.error ?? "Could not set featured release.");
      }

      setFeaturedReleaseId(body.data.featuredReleaseId ?? null);
      setNotice("Featured release updated.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not set featured release.");
    } finally {
      setPendingFeaturedReleaseId(null);
    }
  }, [setError, setFeaturedReleaseId, setNotice]);

  useEffect(() => {
    if (pendingFeaturedReleaseId !== null) {
      return;
    }

    const normalizedFeaturedReleaseId = resolveNormalizedFeaturedReleaseId({
      currentFeaturedReleaseId: state.featuredReleaseId,
      releases,
    });

    if (normalizedFeaturedReleaseId === state.featuredReleaseId) {
      return;
    }

    setPendingFeaturedReleaseId(normalizedFeaturedReleaseId ?? "__clear__");

    const payload = { featuredReleaseId: normalizedFeaturedReleaseId };
    void fetch("/api/admin/settings/store", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((response) => response.json().catch(() => null).then((body) => ({ response, body })))
      .then(({ response, body }) => {
        if (!response.ok || !body?.ok || !body?.data) {
          return;
        }

        setFeaturedReleaseId(body.data.featuredReleaseId ?? null);
      })
      .finally(() => {
        setPendingFeaturedReleaseId(null);
      });
  }, [
    pendingFeaturedReleaseId,
    releases,
    setFeaturedReleaseId,
    state.featuredReleaseId,
  ]);

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
