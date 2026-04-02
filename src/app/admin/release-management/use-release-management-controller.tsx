import { useCallback, useEffect, useRef } from "react";

import { createReleaseActions } from "./use-release-management-release-actions";
import { createTrackEditActions } from "./use-release-management-track-edit-actions";
import { createTrackImportUploadActions } from "./use-release-management-track-import-upload-actions";
import { useReleaseManagementState } from "./use-release-management-state";
import type {
  NewTrackDraft,
  ReleaseDraft,
  TranscodeTasksStatusResponse,
  ReleasePreviewDraft,
  ReleaseRecord,
  ReleasesListResponse,
  TrackDraft,
  TrackRecordPatch,
} from "./types";
import {
  areAllMasterAssetsLossless,
  formatCurrency,
  sortTracks,
  toNewTrackDraft,
  toReleaseDraft,
  toReleasePreviewDraft,
  toTrackDraft,
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
    setReleases,
    setArtists,
    setMinimumPriceFloorCents,
    setStoreCurrency,
    setStripeFeePercentBps,
    setStripeFeeFixedCents,
    setNewArtistId,
    setSelectedReleaseId,
    setCreateComposerOpen,
  } = state;
  const pollingInFlightRef = useRef(false);

  const hasActiveTranscodeJobs = releases.some((release) =>
    release.tracks.some((track) =>
      track.transcodeJobs.some((job) => job.status === "QUEUED" || job.status === "RUNNING"),
    ),
  );
  const syncDrafts = useCallback((list: ReleaseRecord[]) => {
    setDraftsById((previous) => {
      const next: Record<string, ReleaseDraft> = {};
      for (const release of list) {
        const previousDraft = previous[release.id];
        if (!previousDraft) {
          next[release.id] = toReleaseDraft(release);
          continue;
        }

        if (!previousDraft.markLossyOnly && release.isLossyOnly) {
          next[release.id] = {
            ...previousDraft,
            markLossyOnly: true,
            confirmLossyOnly: true,
          };
          continue;
        }

        if (previousDraft.markLossyOnly && areAllMasterAssetsLossless(release)) {
          next[release.id] = {
            ...previousDraft,
            markLossyOnly: false,
            confirmLossyOnly: false,
          };
          continue;
        }

        next[release.id] = previousDraft;
      }
      return next;
    });
  }, [setDraftsById]);

  const syncTrackDrafts = useCallback((list: ReleaseRecord[]) => {
    setTrackDraftsById((previous) => {
      const next: Record<string, TrackDraft> = {};
      for (const release of list) {
        for (const track of release.tracks) {
          next[track.id] = previous[track.id] ?? toTrackDraft(track);
        }
      }
      return next;
    });

    setNewTrackByReleaseId((previous) => {
      const next: Record<string, NewTrackDraft> = {};
      for (const release of list) {
        next[release.id] = previous[release.id] ?? toNewTrackDraft(release);
      }
      return next;
    });

    setTrackUploadRoleById((previous) => {
      const next: Record<string, "MASTER" | "DELIVERY"> = {};
      for (const release of list) {
        for (const track of release.tracks) {
          next[track.id] = previous[track.id] ?? "MASTER";
        }
      }
      return next;
    });

    setExpandedTrackIdByReleaseId((previous) => {
      const next: Record<string, string | null> = {};
      for (const release of list) {
        const previousExpanded = previous[release.id] ?? null;
        const stillExists =
          previousExpanded !== null &&
          release.tracks.some((track) => track.id === previousExpanded);
        next[release.id] = stillExists ? previousExpanded : null;
      }
      return next;
    });

    setDraggingTrackIdByReleaseId((previous) => {
      const next: Record<string, string | null> = {};
      for (const release of list) {
        next[release.id] = previous[release.id] ?? null;
      }
      return next;
    });

    setDragOverTrackIdByReleaseId((previous) => {
      const next: Record<string, string | null> = {};
      for (const release of list) {
        next[release.id] = previous[release.id] ?? null;
      }
      return next;
    });

    setPreviewByReleaseId((previous) => {
      const next: Record<string, ReleasePreviewDraft> = {};
      for (const release of list) {
        next[release.id] = previous[release.id] ?? toReleasePreviewDraft(release);
      }
      return next;
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
      setStripeFeePercentBps(body.stripeFeeEstimate?.percentBps ?? 290);
      setStripeFeeFixedCents(body.stripeFeeEstimate?.fixedFeeCents ?? 30);
      const artistList = body.artists;

      setNewArtistId((current) => {
        if (current.length > 0) {
          return current;
        }

        const firstArtist = artistList.find((artist) => artist.deletedAt === null);
        return firstArtist?.id ?? current;
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
    setStripeFeePercentBps,
    setStripeFeeFixedCents,
    setNewArtistId,
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

  const renderPricingDetails = (draft: ReleaseDraft, currency: string) => {
    if (draft.pricingMode === "FREE") {
      return (
        <p className="mt-2 text-xs text-zinc-500">
          Free release. Stripe is bypassed and no minimum floor applies.
        </p>
      );
    }

    const estimate = getPricingEstimate(draft, currency);

    return (
      <>
        <p className="mt-2 text-xs text-zinc-500">
          Minimum system floor:{" "}
          {draft.pricingMode === "PWYW" && draft.allowFreeCheckout
            ? `${formatCurrency(0, currency)} (free checkout enabled) or ${formatCurrency(minimumPriceFloorCents, currency)}+`
            : formatCurrency(minimumPriceFloorCents, currency)}
          .
        </p>
        {estimate ? (
          <p className="mt-1 text-xs text-zinc-400">
            At {estimate.grossLabel}, Stripe fees are ~{estimate.feeLabel} and payout is ~
            {estimate.netLabel}.
          </p>
        ) : draft.pricingMode === "PWYW" && draft.allowFreeCheckout ? (
          <p className="mt-1 text-xs text-zinc-400">
            Free checkout is enabled. Buyers can check out at{" "}
            {formatCurrency(0, currency)}.
          </p>
        ) : (
          <p className="mt-1 text-xs text-zinc-500">
            Enter a price to preview Stripe fee and net payout.
          </p>
        )}
        {estimate?.belowFloor ? (
          <p className="mt-2 rounded-lg border border-amber-700/60 bg-amber-950/40 px-3 py-2 text-xs text-amber-300">
            Price is below the minimum floor of {formatCurrency(minimumPriceFloorCents, currency)}.
          </p>
        ) : null}
      </>
    );
  };

  return {
    ...state,
    tasksStatus,
    tasksLoading,
    tasksError,
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
  };
}

export type ReleaseManagementController = ReturnType<
  typeof useReleaseManagementController
>;
