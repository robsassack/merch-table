import type { ChangeEvent } from "react";

import {
  assignAppendTrackNumbers,
  assignSequentialTrackNumbers,
  resolveTrackImportOrder,
} from "@/lib/audio/track-import";
import { parseTrackImportFileMetadata } from "@/lib/audio/track-import-browser";

import { ALLOWED_AUDIO_MIME_TYPES } from "./constants";
import {
  createTrackForRelease,
  updateTrackMetadataFromAudio,
  uploadTrackAsset,
} from "./track-upload-api";
import type { ReleaseManagementState } from "./use-release-management-state";
import type {
  PlannedTrackImport,
  ReleaseRecord,
  TrackImportMode,
  TrackImportStatus,
  TrackRecord,
} from "./types";
import {
  formatTrackDuration,
  resolveAudioMimeType,
  resolvePreviewPayload,
  toReleasePreviewDraft,
} from "./utils";

type TrackImportUploadActionsInput = ReleaseManagementState & {
  loadReleases: (options?: { silent?: boolean }) => Promise<void>;
};

function hasMetadataTrackNumberConflict(input: {
  existingTrackNumbers: number[];
  importedMetadataTrackNumbers: Array<number | null | undefined>;
}) {
  const existingTrackNumbers = new Set(
    input.existingTrackNumbers
      .filter((value) => Number.isFinite(value) && value > 0)
      .map((value) => Math.round(value)),
  );

  const seenImported = new Set<number>();
  for (const importedTrackNumber of input.importedMetadataTrackNumbers) {
    if (typeof importedTrackNumber !== "number" || !Number.isFinite(importedTrackNumber)) {
      continue;
    }

    const normalizedTrackNumber = Math.round(importedTrackNumber);
    if (normalizedTrackNumber <= 0) {
      continue;
    }

    if (
      existingTrackNumbers.has(normalizedTrackNumber) ||
      seenImported.has(normalizedTrackNumber)
    ) {
      return true;
    }

    seenImported.add(normalizedTrackNumber);
  }

  return false;
}

export function createTrackImportUploadActions(input: TrackImportUploadActionsInput) {
  const {
    releases,
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
    importConflictDialog,
    setImportConflictDialog,
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

  const runTrackImport = async (inputValue: {
    release: ReleaseRecord;
    selectedFiles: File[];
    mode: TrackImportMode;
  }) => {
    const { release, selectedFiles, mode } = inputValue;
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
      const trackNumberAssignments =
        mode === "append"
          ? assignAppendTrackNumbers(
              orderedMetadata.map((entry) => ({
                item: entry,
                metadataTrackNumber: entry.metadata.metadataTrackNumber,
              })),
              release.tracks.map((track) => track.trackNumber),
            ).sort((a, b) => a.trackNumber - b.trackNumber)
          : assignSequentialTrackNumbers(orderedMetadata, 1);

      const plannedImports: PlannedTrackImport[] = trackNumberAssignments.map((assignment, index) => ({
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

      let completed = 0;
      let failed = 0;
      let previewQueuedCount = 0;
      let deliveryQueuedCount = 0;
      const failedImports: Array<{ fileName: string; error: string }> = [];

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
          if (commit.deliveryJobQueued) {
            deliveryQueuedCount += 1;
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
          const resolvedError =
            importError instanceof Error ? importError.message : "Import failed.";
          setTrackImportJobStatus(
            release.id,
            plannedImport.id,
            "failed",
            resolvedError,
          );
          failedImports.push({
            fileName: plannedImport.fileName,
            error: resolvedError,
          });
          failed += 1;
        }
      }

      await loadReleases({ silent: true });
      setNotice(
        `Imported ${completed}/${plannedImports.length} track${plannedImports.length === 1 ? "" : "s"} for "${release.title}".${
          previewQueuedCount > 0 ? ` Preview jobs queued: ${previewQueuedCount}.` : ""
        }${deliveryQueuedCount > 0 ? ` Delivery jobs queued: ${deliveryQueuedCount}.` : ""}`,
      );

      if (failed > 0) {
        const firstFailure = failedImports[0];
        setError(
          firstFailure
            ? `${failed} import job${failed === 1 ? "" : "s"} failed. First failure (${firstFailure.fileName}): ${firstFailure.error}`
            : `${failed} import job${failed === 1 ? "" : "s"} failed. See status list below.`,
        );
      }
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Could not import tracks.");
    } finally {
      setPendingTrackImportReleaseId(null);
    }
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

    if (release.tracks.length > 0) {
      const parsedMetadata = await Promise.all(
        selectedFiles.map((file) => parseTrackImportFileMetadata(file)),
      );
      const hasConflict = hasMetadataTrackNumberConflict({
        existingTrackNumbers: release.tracks.map((track) => track.trackNumber),
        importedMetadataTrackNumbers: parsedMetadata.map(
          (entry) => entry.metadataTrackNumber,
        ),
      });

      if (hasConflict) {
        setImportConflictDialog({
          releaseId: release.id,
          releaseTitle: release.title,
          existingTrackCount: release.tracks.length,
          selectedFiles,
        });
        return;
      }
    }

    await runTrackImport({
      release,
      selectedFiles,
      mode: "append",
    });
  };

  const onResolveImportConflict = async (mode: TrackImportMode | "cancel") => {
    const conflict = importConflictDialog;
    if (!conflict) {
      return;
    }

    setImportConflictDialog(null);
    if (mode === "cancel") {
      return;
    }

    const release = releases.find((entry) => entry.id === conflict.releaseId);
    if (!release) {
      setError("Release no longer exists. Refresh and try importing again.");
      return;
    }

    await runTrackImport({
      release,
      selectedFiles: conflict.selectedFiles,
      mode,
    });
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
        // Preserve curated release-track titles on inline uploads/replacements.
        title: track.title,
        durationMs: metadata.durationMs,
      });

      await loadReleases({ silent: true });
      setNotice(
        `Uploaded "${file.name}" as ${uploadRole.toLowerCase()} for "${track.title}" (synced duration to ${formatTrackDuration(metadata.durationMs)}).${
          commitBody.previewJobQueued ? " Preview job queued." : ""
        }${commitBody.deliveryJobQueued ? " Delivery job queued." : ""}${
          commitBody.forcedLossyOnly
            ? " Master quality workflow switched to lossy masters."
            : ""
        }${
          commitBody.forcedLosslessOnly
            ? " Master quality workflow switched to lossless masters."
            : ""
        }${
          (commitBody.removedDeliveryAssetCount ?? 0) > 0
            ? ` Removed ${commitBody.removedDeliveryAssetCount} delivery item${
                commitBody.removedDeliveryAssetCount === 1 ? "" : "s"
              } for this track.`
            : ""
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
    onResolveImportConflict,
    onInlineTrackFileChange,
  };
}
