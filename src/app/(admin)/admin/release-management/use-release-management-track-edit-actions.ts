import type { ReleaseManagementState } from "./use-release-management-state";
import type {
  ReleasePreviewDraft,
  ReleaseRecord,
  TrackMutationResponse,
  TrackRecord,
  TrackRecordPatch,
} from "./types";
import {
  moveItemInArray,
  parsePositiveInteger,
  resolvePreviewPayload,
  sortTracks,
  toNewTrackDraft,
  toReleasePreviewDraft,
  toTrackDraft,
  withReleaseDerivedTrackStats,
} from "./utils";

type TrackEditActionsInput = ReleaseManagementState & {
  loadReleases: (options?: { silent?: boolean }) => Promise<void>;
  applyTrackPatchToRelease: (releaseId: string, track: TrackRecordPatch) => void;
};

export function createTrackEditActions(input: TrackEditActionsInput) {
  const {
    newTrackByReleaseId,
    previewByReleaseId,
    setError,
    setNotice,
    setPendingPreviewApplyReleaseId,
    setReleases,
    setTrackDraftsById,
    setPendingTrackCreateReleaseId,
    setNewTrackByReleaseId,
    setExpandedTrackIdByReleaseId,
    loadReleases,
    setPendingTrackId,
    applyTrackPatchToRelease,
    draggingTrackIdByReleaseId,
    setDragOverTrackIdByReleaseId,
    setDraggingTrackIdByReleaseId,
    pendingTrackReorderReleaseId,
    pendingTrackImportReleaseId,
    pendingTrackUploadId,
    pendingTrackRequeueId,
    pendingTrackId,
    pendingReleaseId,
    createPending,
    setPendingTrackReorderReleaseId,
    setPendingTrackRequeueId,
  } = input;

  const onApplyReleasePreviewToTracks = async (
    release: ReleaseRecord,
    previewDraftOverride?: ReleasePreviewDraft,
    options?: { silent?: boolean },
  ) => {
    const previewDraft =
      previewDraftOverride ?? previewByReleaseId[release.id] ?? toReleasePreviewDraft(release);
    const previewPayload = resolvePreviewPayload(previewDraft);
    const tracks = sortTracks(release.tracks);

    if (tracks.length === 0) {
      return;
    }

    if (!options?.silent) {
      setError(null);
      setNotice(null);
    }
    setPendingPreviewApplyReleaseId(release.id);

    try {
      const updatedTracks: TrackRecordPatch[] = [];
      let queuedPreviewJobs = 0;
      for (const track of tracks) {
        const response = await fetch(`/api/admin/releases/${release.id}/tracks/${track.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "update",
            previewMode: previewPayload.previewMode,
            previewSeconds: previewPayload.previewSeconds,
          }),
        });
        const body = (await response.json().catch(() => null)) as TrackMutationResponse | null;
        if (!response.ok || !body?.ok || !body.track) {
          throw new Error(body?.error ?? `Could not apply preview settings to "${track.title}".`);
        }

        updatedTracks.push(body.track);
        if (body.previewJobQueued) {
          queuedPreviewJobs += 1;
        }
      }

      if (updatedTracks.length > 0) {
        setReleases((previous) =>
          previous.map((entry) => {
            if (entry.id !== release.id) {
              return entry;
            }

            const byId = new Map(updatedTracks.map((track) => [track.id, track]));
            const merged = entry.tracks.map((track) => byId.get(track.id) ?? track);
            return withReleaseDerivedTrackStats({
              ...entry,
              tracks: merged,
            });
          }),
        );

        setTrackDraftsById((previous) => {
          const next = { ...previous };
          for (const track of updatedTracks) {
            next[track.id] = toTrackDraft(track);
          }
          return next;
        });
      }
      if (!options?.silent) {
        const baseNotice = `Applied release preview settings to ${tracks.length} track${
          tracks.length === 1 ? "" : "s"
        }.`;
        if (queuedPreviewJobs > 0) {
          setNotice(
            `${baseNotice} Queued ${queuedPreviewJobs} new preview transcode job${
              queuedPreviewJobs === 1 ? "" : "s"
            }.`,
          );
        } else {
          setNotice(baseNotice);
        }
      }
    } catch (previewError) {
      setError(
        previewError instanceof Error
          ? previewError.message
          : "Could not apply release preview settings.",
      );
    } finally {
      setPendingPreviewApplyReleaseId(null);
    }
  };

  const onCreateTrack = async (release: ReleaseRecord) => {
    const draft = newTrackByReleaseId[release.id] ?? toNewTrackDraft(release);
    const previewDraft = previewByReleaseId[release.id] ?? toReleasePreviewDraft(release);
    const previewPayload = resolvePreviewPayload(previewDraft);
    if (draft.title.trim().length === 0) {
      setError("Track title is required.");
      return;
    }

    setError(null);
    setNotice(null);
    setPendingTrackCreateReleaseId(release.id);

    try {
      const response = await fetch(`/api/admin/releases/${release.id}/tracks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          artistOverride: draft.artistOverride.trim().length > 0 ? draft.artistOverride : null,
          trackNumber: parsePositiveInteger(draft.trackNumber) ?? undefined,
          lyrics: draft.lyrics.trim().length > 0 ? draft.lyrics : null,
          credits: draft.credits.trim().length > 0 ? draft.credits : null,
          previewMode: previewPayload.previewMode,
          previewSeconds: previewPayload.previewSeconds,
        }),
      });
      const body = (await response.json().catch(() => null)) as TrackMutationResponse | null;
      if (!response.ok || !body?.ok || !body.track) {
        throw new Error(body?.error ?? "Could not create track.");
      }

      setTrackDraftsById((previous) => ({
        ...previous,
        [body.track!.id]: toTrackDraft(body.track!),
      }));
      setNewTrackByReleaseId((previous) => ({
        ...previous,
        [release.id]: {
          ...previous[release.id],
          title: "",
          artistOverride: "",
          trackNumber: "",
          lyrics: "",
          credits: "",
        },
      }));
      setExpandedTrackIdByReleaseId((previous) => ({
        ...previous,
        [release.id]: body.track!.id,
      }));
      await loadReleases({ silent: true });
      setNotice(`Added track "${body.track.title}".`);
    } catch (trackError) {
      setError(trackError instanceof Error ? trackError.message : "Could not create track.");
    } finally {
      setPendingTrackCreateReleaseId(null);
    }
  };

  const onUpdateTrack = async (releaseId: string, trackId: string) => {
    const draft = input.trackDraftsById[trackId];
    if (!draft) {
      return;
    }

    if (draft.title.trim().length === 0) {
      setError("Track title is required.");
      return;
    }

    setError(null);
    setNotice(null);
    setPendingTrackId(trackId);

    try {
      const response = await fetch(`/api/admin/releases/${releaseId}/tracks/${trackId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "update",
          title: draft.title,
          artistOverride: draft.artistOverride.trim().length > 0 ? draft.artistOverride : null,
          trackNumber: parsePositiveInteger(draft.trackNumber) ?? undefined,
          lyrics: draft.lyrics.trim().length > 0 ? draft.lyrics : null,
          credits: draft.credits.trim().length > 0 ? draft.credits : null,
        }),
      });
      const body = (await response.json().catch(() => null)) as TrackMutationResponse | null;
      if (!response.ok || !body?.ok || !body.track) {
        throw new Error(body?.error ?? "Could not save track.");
      }

      applyTrackPatchToRelease(releaseId, body.track);
      if (body.previewJobQueued) {
        setNotice(`Saved track "${body.track.title}" and queued a new preview transcode.`);
      } else {
        setNotice(`Saved track "${body.track.title}".`);
      }
    } catch (trackError) {
      setError(trackError instanceof Error ? trackError.message : "Could not save track.");
    } finally {
      setPendingTrackId(null);
    }
  };

  const onReorderTrackDrop = async (
    release: ReleaseRecord,
    targetTrackId: string,
    options?: { draggedTrackId?: string | null },
  ) => {
    const draggedTrackId = options?.draggedTrackId ?? draggingTrackIdByReleaseId[release.id] ?? null;
    if (!draggedTrackId || draggedTrackId === targetTrackId) {
      setDragOverTrackIdByReleaseId((previous) => ({
        ...previous,
        [release.id]: null,
      }));
      setDraggingTrackIdByReleaseId((previous) => ({
        ...previous,
        [release.id]: null,
      }));
      return;
    }

    if (
      pendingTrackReorderReleaseId ||
      input.pendingPreviewApplyReleaseId ||
      pendingTrackImportReleaseId ||
      pendingTrackUploadId ||
      pendingTrackRequeueId ||
      pendingTrackId ||
      pendingReleaseId ||
      createPending
    ) {
      return;
    }

    const current = sortTracks(release.tracks);
    const fromIndex = current.findIndex((track) => track.id === draggedTrackId);
    const toIndex = current.findIndex((track) => track.id === targetTrackId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
      setDragOverTrackIdByReleaseId((previous) => ({
        ...previous,
        [release.id]: null,
      }));
      setDraggingTrackIdByReleaseId((previous) => ({
        ...previous,
        [release.id]: null,
      }));
      return;
    }

    const reordered = moveItemInArray(current, fromIndex, toIndex).map((track, index) => ({
      ...track,
      trackNumber: index + 1,
    }));

    // Optimistic local reorder to keep drag UX responsive.
    setReleases((previous) =>
      previous.map((entry) =>
        entry.id === release.id
          ? withReleaseDerivedTrackStats({
              ...entry,
              tracks: reordered,
            })
          : entry,
      ),
    );

    setTrackDraftsById((previous) => {
      const next = { ...previous };
      for (const track of reordered) {
        const existing = next[track.id] ?? toTrackDraft(track);
        next[track.id] = {
          ...existing,
          trackNumber: String(track.trackNumber),
        };
      }
      return next;
    });

    setPendingTrackReorderReleaseId(release.id);
    setError(null);
    setNotice(null);

    try {
      const updatedTracks: TrackRecordPatch[] = [];
      for (const track of reordered) {
        const response = await fetch(
          `/api/admin/releases/${release.id}/tracks/${track.id}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              action: "update",
              trackNumber: track.trackNumber,
            }),
          },
        );
        const body = (await response.json().catch(() => null)) as TrackMutationResponse | null;
        if (!response.ok || !body?.ok || !body.track) {
          throw new Error(body?.error ?? `Could not reorder "${track.title}".`);
        }
        updatedTracks.push(body.track);
      }

      if (updatedTracks.length > 0) {
        setReleases((previous) =>
          previous.map((entry) => {
            if (entry.id !== release.id) {
              return entry;
            }

            const byId = new Map(updatedTracks.map((track) => [track.id, track]));
            const merged = entry.tracks.map((track) => byId.get(track.id) ?? track);
            return withReleaseDerivedTrackStats({
              ...entry,
              tracks: merged,
            });
          }),
        );

        setTrackDraftsById((previous) => {
          const next = { ...previous };
          for (const track of updatedTracks) {
            next[track.id] = toTrackDraft(track);
          }
          return next;
        });
      }

      setNotice("Track order updated.");
    } catch (reorderError) {
      setError(reorderError instanceof Error ? reorderError.message : "Could not reorder tracks.");
      await loadReleases({ silent: true });
    } finally {
      setPendingTrackReorderReleaseId(null);
      setDragOverTrackIdByReleaseId((previous) => ({
        ...previous,
        [release.id]: null,
      }));
      setDraggingTrackIdByReleaseId((previous) => ({
        ...previous,
        [release.id]: null,
      }));
    }
  };

  const onDeleteTrack = async (releaseId: string, track: TrackRecord) => {
    setError(null);
    setNotice(null);
    setPendingTrackRequeueId(track.id);

    try {
      const response = await fetch(`/api/admin/releases/${releaseId}/tracks/${track.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "delete",
        }),
      });
      const body = (await response.json().catch(() => null)) as TrackMutationResponse | null;
      if (!response.ok || !body?.ok || !body.deletedTrackId) {
        throw new Error(body?.error ?? "Could not delete track.");
      }

      await loadReleases({ silent: true });
      setNotice(`Deleted track "${track.title}".`);
    } catch (trackError) {
      setError(trackError instanceof Error ? trackError.message : "Could not delete track.");
    } finally {
      setPendingTrackRequeueId(null);
    }
  };

  const onRequeueTrackFailedTranscodes = async (
    releaseId: string,
    track: TrackRecord,
  ) => {
    setError(null);
    setNotice(null);
    setPendingTrackId(track.id);

    try {
      const response = await fetch(`/api/admin/releases/${releaseId}/tracks/${track.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "requeue-failed-transcodes",
        }),
      });
      const body = (await response.json().catch(() => null)) as TrackMutationResponse | null;
      if (!response.ok || !body?.ok || !body.track) {
        throw new Error(body?.error ?? "Could not requeue failed transcode jobs for this track.");
      }

      applyTrackPatchToRelease(releaseId, body.track);

      const queuedPreviewJobs = body.queuedPreviewJobs ?? 0;
      const queuedDeliveryJobs = body.queuedDeliveryJobs ?? 0;
      const queuedTotal = body.queuedTranscodeJobs ?? queuedPreviewJobs + queuedDeliveryJobs;
      const skippedFailedJobs = body.skippedFailedJobs ?? 0;
      const failedJobsFound = body.failedJobsFound ?? queuedTotal + skippedFailedJobs;

      if (queuedTotal === 0) {
        if (failedJobsFound === 0) {
          setNotice(`No failed transcode jobs were found for "${body.track.title}".`);
          return;
        }

        setNotice(
          `No failed transcode jobs were queued for "${body.track.title}". Skipped ${skippedFailedJobs}.`,
        );
        return;
      }

      if (skippedFailedJobs > 0) {
        setNotice(
          `Queued ${queuedTotal} failed transcode job${queuedTotal === 1 ? "" : "s"} for "${body.track.title}", skipped ${skippedFailedJobs}.`,
        );
        return;
      }

      setNotice(
        `Queued ${queuedTotal} failed transcode job${queuedTotal === 1 ? "" : "s"} for "${body.track.title}".`,
      );
    } catch (trackError) {
      setError(
        trackError instanceof Error
          ? trackError.message
          : "Could not requeue failed transcode jobs for this track.",
      );
    } finally {
      setPendingTrackId(null);
    }
  };

  return {
    onApplyReleasePreviewToTracks,
    onCreateTrack,
    onUpdateTrack,
    onReorderTrackDrop,
    onDeleteTrack,
    onRequeueTrackFailedTranscodes,
  };
}
