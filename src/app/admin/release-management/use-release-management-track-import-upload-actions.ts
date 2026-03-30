import type { ChangeEvent } from "react";

import {
  assignSequentialTrackNumbers,
  resolveTrackImportOrder,
} from "@/lib/audio/track-import";
import { parseTrackImportFileMetadata } from "@/lib/audio/track-import-browser";

import { ALLOWED_AUDIO_MIME_TYPES } from "./constants";
import type { ReleaseManagementState } from "./use-release-management-state";
import type {
  PlannedTrackImport,
  PreviewMode,
  ReleaseRecord,
  TrackAssetCommitResponse,
  TrackImportMode,
  TrackImportStatus,
  TrackMutationResponse,
  TrackRecord,
  UploadUrlResponse,
} from "./types";
import {
  formatTrackDuration,
  resolveAudioMimeType,
  resolvePreviewPayload,
  sortTracks,
  toReleasePreviewDraft,
  uploadViaSignedPut,
} from "./utils";

type TrackImportUploadActionsInput = ReleaseManagementState & {
  loadReleases: () => Promise<void>;
};

export function createTrackImportUploadActions(input: TrackImportUploadActionsInput) {
  const {
    previewByReleaseId,
    pendingPreviewApplyReleaseId,
    pendingTrackImportReleaseId,
    pendingTrackUploadId,
    pendingTrackId,
    pendingReleaseId,
    createPending,
    setError,
    setNotice,
    setPendingTrackImportReleaseId,
    setTrackImportJobsByReleaseId,
    setPendingTrackUploadId,
    setTrackUploadProgressById,
    trackUploadRoleById,
    loadReleases,
    setTrackImportJobsByReleaseId: setTrackImportJobsByReleaseIdState,
  } = input;

  const setTrackImportJobStatus = (
    releaseId: string,
    jobId: string,
    status: TrackImportStatus,
    error: string | null = null,
  ) => {
    setTrackImportJobsByReleaseIdState((previous) => {
      const jobs = previous[releaseId] ?? [];
      return {
        ...previous,
        [releaseId]: jobs.map((job) =>
          job.id === jobId
            ? {
                ...job,
                status,
                error,
              }
            : job,
        ),
      };
    });
  };

  const createTrackForRelease = async (inputValue: {
    releaseId: string;
    title: string;
    trackNumber?: number;
    durationMs?: number | null;
    previewMode: PreviewMode;
    previewSeconds: number | null;
  }) => {
    const response = await fetch(`/api/admin/releases/${inputValue.releaseId}/tracks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: inputValue.title,
        trackNumber: inputValue.trackNumber,
        durationMs: inputValue.durationMs,
        previewMode: inputValue.previewMode,
        previewSeconds: inputValue.previewSeconds,
      }),
    });
    const body = (await response.json().catch(() => null)) as TrackMutationResponse | null;
    if (!response.ok || !body?.ok || !body.track) {
      throw new Error(body?.error ?? "Could not create track.");
    }

    return body.track;
  };

  const deleteTrackForRelease = async (inputValue: { releaseId: string; trackId: string }) => {
    const response = await fetch(
      `/api/admin/releases/${inputValue.releaseId}/tracks/${inputValue.trackId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "delete",
        }),
      },
    );

    const body = (await response.json().catch(() => null)) as TrackMutationResponse | null;
    if (!response.ok || !body?.ok || !body.deletedTrackId) {
      throw new Error(body?.error ?? "Could not delete track.");
    }
  };

  const updateTrackMetadataFromAudio = async (inputValue: {
    releaseId: string;
    trackId: string;
    title: string;
    durationMs: number | null;
  }) => {
    const response = await fetch(
      `/api/admin/releases/${inputValue.releaseId}/tracks/${inputValue.trackId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "update",
          title: inputValue.title,
          durationMs: inputValue.durationMs,
        }),
      },
    );

    const body = (await response.json().catch(() => null)) as TrackMutationResponse | null;
    if (!response.ok || !body?.ok || !body.track) {
      throw new Error(body?.error ?? "Could not sync track metadata.");
    }

    return body.track;
  };

  const uploadTrackAsset = async (inputValue: {
    releaseId: string;
    trackId: string;
    file: File;
    contentType: string;
    assetRole: "MASTER" | "DELIVERY";
    onProgress?: (percent: number) => void;
  }) => {
    const uploadUrlResponse = await fetch("/api/admin/upload/upload-url", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fileName: inputValue.file.name,
        contentType: inputValue.contentType,
        sizeBytes: inputValue.file.size,
      }),
    });
    const uploadUrlBody = (await uploadUrlResponse
      .json()
      .catch(() => null)) as UploadUrlResponse | null;

    if (
      !uploadUrlResponse.ok ||
      !uploadUrlBody?.ok ||
      !uploadUrlBody.uploadUrl ||
      !uploadUrlBody.storageKey ||
      !uploadUrlBody.bucket ||
      !uploadUrlBody.storageProvider
    ) {
      throw new Error(uploadUrlBody?.error ?? "Could not create upload URL.");
    }

    await uploadViaSignedPut({
      uploadUrl: uploadUrlBody.uploadUrl,
      file: inputValue.file,
      contentType: inputValue.contentType,
      requiredHeaders: uploadUrlBody.requiredHeaders ?? {},
      onProgress: (percent) => {
        inputValue.onProgress?.(percent);
      },
    });

    const commitResponse = await fetch("/api/admin/upload/track-assets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        releaseId: inputValue.releaseId,
        trackId: inputValue.trackId,
        fileName: inputValue.file.name,
        storageKey: uploadUrlBody.storageKey,
        contentType: inputValue.contentType,
        sizeBytes: inputValue.file.size,
        assetRole: inputValue.assetRole,
      }),
    });
    const commitBody = (await commitResponse
      .json()
      .catch(() => null)) as TrackAssetCommitResponse | null;
    if (!commitResponse.ok || !commitBody?.ok) {
      throw new Error(commitBody?.error ?? "Could not attach uploaded asset to this track.");
    }

    return commitBody;
  };

  const onImportTrackFiles = async (
    release: ReleaseRecord,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (selectedFiles.length === 0) {
      return;
    }

    if (
      pendingPreviewApplyReleaseId ||
      pendingTrackImportReleaseId ||
      pendingTrackUploadId ||
      pendingTrackId ||
      pendingReleaseId ||
      createPending
    ) {
      return;
    }

    const prepared = selectedFiles.map((file) => {
      const contentType = resolveAudioMimeType(file);
      return {
        file,
        contentType,
      };
    });

    const unsupported = prepared.find(
      (entry) => !ALLOWED_AUDIO_MIME_TYPES.has(entry.contentType),
    );
    if (unsupported) {
      setError(
        `${unsupported.file.name}: unsupported file type (${unsupported.contentType || "unknown"}).`,
      );
      return;
    }

    let mode: TrackImportMode = "append";
    if (release.tracks.length > 0) {
      const replaceSelected = window.confirm(
        `Import mode for "${release.title}": press OK to REPLACE existing tracks, or Cancel to APPEND.`,
      );
      if (replaceSelected) {
        const confirmed = window.confirm(
          `Replace will permanently delete ${release.tracks.length} existing track${release.tracks.length === 1 ? "" : "s"} and their linked assets/jobs. Continue?`,
        );
        if (!confirmed) {
          return;
        }

        mode = "replace";
      }
    }

    setError(null);
    setNotice(null);
    setPendingTrackImportReleaseId(release.id);

    try {
      const previewDraft = previewByReleaseId[release.id] ?? toReleasePreviewDraft(release);
      const previewPayload = resolvePreviewPayload(previewDraft);
      const parsedMetadata = await Promise.all(
        prepared.map(async (entry) => ({
          file: entry.file,
          contentType: entry.contentType,
          metadata: await parseTrackImportFileMetadata(entry.file),
        })),
      );

      const orderedCandidates = resolveTrackImportOrder(
        parsedMetadata.map((entry, index) => ({
          id: index,
          fileName: entry.metadata.fileName,
          metadataTrackNumber: entry.metadata.metadataTrackNumber,
        })),
      );

      const orderedMetadata = orderedCandidates.map((candidate) => parsedMetadata[candidate.id]);
      const startTrackNumber = mode === "replace" ? 1 : release.tracks.length + 1;
      const plannedImports: PlannedTrackImport[] = assignSequentialTrackNumbers(
        orderedMetadata,
        startTrackNumber,
      ).map((assignment, index) => ({
        id: `${Date.now()}-${index}-${assignment.item.file.name}`,
        file: assignment.item.file,
        fileName: assignment.item.file.name,
        contentType: assignment.item.contentType,
        metadata: assignment.item.metadata,
        trackNumber: assignment.trackNumber,
      }));

      setTrackImportJobsByReleaseId((previous) => ({
        ...previous,
        [release.id]: plannedImports.map((entry) => ({
          id: entry.id,
          fileName: entry.fileName,
          title: entry.metadata.resolvedTitle,
          plannedTrackNumber: entry.trackNumber,
          durationMs: entry.metadata.durationMs,
          status: "pending",
          error: null,
        })),
      }));

      if (mode === "replace") {
        const existingTracks = sortTracks(release.tracks);
        for (const track of existingTracks) {
          await deleteTrackForRelease({
            releaseId: release.id,
            trackId: track.id,
          });
        }
      }

      let completed = 0;
      let failed = 0;
      let previewQueuedCount = 0;

      for (const plannedImport of plannedImports) {
        try {
          const createdTrack = await createTrackForRelease({
            releaseId: release.id,
            title: plannedImport.metadata.resolvedTitle,
            trackNumber: plannedImport.trackNumber,
            durationMs: plannedImport.metadata.durationMs,
            previewMode: previewPayload.previewMode,
            previewSeconds: previewPayload.previewSeconds,
          });

          setTrackImportJobStatus(release.id, plannedImport.id, "track-created");

          const commit = await uploadTrackAsset({
            releaseId: release.id,
            trackId: createdTrack.id,
            file: plannedImport.file,
            contentType: plannedImport.contentType,
            assetRole: "MASTER",
          });

          if (commit.previewJobQueued) {
            previewQueuedCount += 1;
          }

          // Always refresh title/duration from uploaded file metadata.
          await updateTrackMetadataFromAudio({
            releaseId: release.id,
            trackId: createdTrack.id,
            title: plannedImport.metadata.resolvedTitle,
            durationMs: plannedImport.metadata.durationMs,
          });

          setTrackImportJobStatus(release.id, plannedImport.id, "uploaded");
          completed += 1;
        } catch (importError) {
          setTrackImportJobStatus(
            release.id,
            plannedImport.id,
            "failed",
            importError instanceof Error ? importError.message : "Import failed.",
          );
          failed += 1;
        }
      }

      await loadReleases();
      setNotice(
        `Imported ${completed}/${plannedImports.length} track${plannedImports.length === 1 ? "" : "s"} for "${release.title}".${
          previewQueuedCount > 0 ? ` Preview jobs queued: ${previewQueuedCount}.` : ""
        }`,
      );

      if (failed > 0) {
        setError(`${failed} import job${failed === 1 ? "" : "s"} failed. See status list below.`);
      }
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Could not import tracks.");
    } finally {
      setPendingTrackImportReleaseId(null);
    }
  };

  const onInlineTrackFileChange = async (
    releaseId: string,
    track: TrackRecord,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    if (
      pendingPreviewApplyReleaseId ||
      pendingTrackImportReleaseId ||
      pendingTrackUploadId ||
      pendingTrackId ||
      pendingReleaseId ||
      createPending
    ) {
      return;
    }

    const uploadRole = trackUploadRoleById[track.id] ?? "MASTER";
    const contentType = resolveAudioMimeType(file);
    if (!ALLOWED_AUDIO_MIME_TYPES.has(contentType)) {
      setError(
        `${file.name}: unsupported file type (${contentType || "unknown"}).`,
      );
      return;
    }

    setError(null);
    setNotice(null);
    setPendingTrackUploadId(track.id);
    setTrackUploadProgressById((previous) => ({
      ...previous,
      [track.id]: 0,
    }));

    try {
      const metadata = await parseTrackImportFileMetadata(file);
      const commitBody = await uploadTrackAsset({
        releaseId,
        trackId: track.id,
        file,
        contentType,
        assetRole: uploadRole,
        onProgress: (percent) =>
          setTrackUploadProgressById((previous) => ({
            ...previous,
            [track.id]: percent,
          })),
      });

      await updateTrackMetadataFromAudio({
        releaseId,
        trackId: track.id,
        title: metadata.resolvedTitle,
        durationMs: metadata.durationMs,
      });

      await loadReleases();
      setNotice(
        `Uploaded "${file.name}" as ${uploadRole.toLowerCase()} for "${track.title}" (synced metadata to "${metadata.resolvedTitle}", ${formatTrackDuration(metadata.durationMs)}).${
          commitBody.previewJobQueued ? " Preview job queued." : ""
        }`,
      );
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Could not upload track asset.",
      );
    } finally {
      setPendingTrackUploadId(null);
      setTrackUploadProgressById((previous) => {
        const next = { ...previous };
        delete next[track.id];
        return next;
      });
    }
  };

  return {
    onImportTrackFiles,
    onInlineTrackFileChange,
  };
}
