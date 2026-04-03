import type { Dispatch, SetStateAction } from "react";

import type { ReleaseMutationResponse, ReleaseRecord } from "./types";
import { getMutationError } from "./utils";

type ReleaseTranscodeActionsInput = {
  setError: Dispatch<SetStateAction<string | null>>;
  setNotice: Dispatch<SetStateAction<string | null>>;
  setPendingReleaseId: Dispatch<SetStateAction<string | null>>;
  replaceRelease: (updated: ReleaseRecord) => void;
};

export function createReleaseTranscodeActions(input: ReleaseTranscodeActionsInput) {
  const { setError, setNotice, setPendingReleaseId, replaceRelease } = input;

  const onGenerateDownloadFormats = async (release: ReleaseRecord) => {
    setError(null);
    setNotice(null);
    setPendingReleaseId(release.id);

    try {
      const response = await fetch(`/api/admin/releases/${release.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "generate-download-formats",
        }),
      });
      const body = (await response.json().catch(() => null)) as ReleaseMutationResponse | null;
      if (!response.ok || !body?.ok || !body.release) {
        throw new Error(getMutationError(body, "Could not queue download format jobs."));
      }

      replaceRelease(body.release);
      const queuedCount = body.queuedTranscodeJobs ?? 0;
      const existingCount = body.alreadyQueuedJobs ?? 0;

      if (queuedCount === 0 && existingCount > 0) {
        setNotice(
          `All eligible tracks already had queued/running transcode jobs (${existingCount}).`,
        );
      } else if (queuedCount > 0 && existingCount > 0) {
        setNotice(
          `Queued ${queuedCount} transcode job${queuedCount === 1 ? "" : "s"} (${existingCount} already queued/running).`,
        );
      } else {
        setNotice(
          `Queued ${queuedCount} transcode job${queuedCount === 1 ? "" : "s"} for download formats.`,
        );
      }
    } catch (queueError) {
      setError(
        queueError instanceof Error
          ? queueError.message
          : "Could not queue download format jobs.",
      );
    } finally {
      setPendingReleaseId(null);
    }
  };

  const onForceRequeueTranscodes = async (release: ReleaseRecord) => {
    setError(null);
    setNotice(null);
    setPendingReleaseId(release.id);

    try {
      const response = await fetch(`/api/admin/releases/${release.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "force-requeue-transcodes",
        }),
      });
      const body = (await response.json().catch(() => null)) as ReleaseMutationResponse | null;
      if (!response.ok || !body?.ok || !body.release) {
        throw new Error(getMutationError(body, "Could not force requeue transcode jobs."));
      }

      replaceRelease(body.release);
      const queuedPreviewJobs = body.queuedPreviewJobs ?? 0;
      const queuedDeliveryJobs = body.queuedDeliveryJobs ?? 0;
      const queuedTotal = body.queuedTranscodeJobs ?? queuedPreviewJobs + queuedDeliveryJobs;

      if (queuedTotal === 0) {
        setNotice("No eligible tracks were found to queue preview or delivery jobs.");
        return;
      }

      if (queuedPreviewJobs > 0 && queuedDeliveryJobs > 0) {
        setNotice(
          `Queued ${queuedPreviewJobs} preview and ${queuedDeliveryJobs} delivery transcode jobs.`,
        );
        return;
      }

      if (queuedPreviewJobs > 0) {
        setNotice(
          `Queued ${queuedPreviewJobs} preview transcode job${queuedPreviewJobs === 1 ? "" : "s"}.`,
        );
        return;
      }

      setNotice(
        `Queued ${queuedDeliveryJobs} delivery transcode job${queuedDeliveryJobs === 1 ? "" : "s"}.`,
      );
    } catch (queueError) {
      setError(
        queueError instanceof Error
          ? queueError.message
          : "Could not force requeue transcode jobs.",
      );
    } finally {
      setPendingReleaseId(null);
    }
  };

  const onRequeueFailedTranscodes = async (release: ReleaseRecord) => {
    setError(null);
    setNotice(null);
    setPendingReleaseId(release.id);

    try {
      const response = await fetch(`/api/admin/releases/${release.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "requeue-failed-transcodes",
        }),
      });
      const body = (await response.json().catch(() => null)) as ReleaseMutationResponse | null;
      if (!response.ok || !body?.ok || !body.release) {
        throw new Error(getMutationError(body, "Could not requeue failed transcode jobs."));
      }

      replaceRelease(body.release);
      const queuedPreviewJobs = body.queuedPreviewJobs ?? 0;
      const queuedDeliveryJobs = body.queuedDeliveryJobs ?? 0;
      const queuedTotal = body.queuedTranscodeJobs ?? queuedPreviewJobs + queuedDeliveryJobs;
      const skippedFailedJobs = body.skippedFailedJobs ?? 0;
      const failedJobsFound = body.failedJobsFound ?? queuedTotal + skippedFailedJobs;

      if (queuedTotal === 0) {
        if (failedJobsFound === 0) {
          setNotice("No failed transcode jobs were found for this release.");
          return;
        }

        setNotice(
          `No failed transcode jobs were queued. Skipped ${skippedFailedJobs} job${skippedFailedJobs === 1 ? "" : "s"}.`,
        );
        return;
      }

      if (skippedFailedJobs > 0) {
        setNotice(
          `Queued ${queuedTotal} failed transcode job${queuedTotal === 1 ? "" : "s"}, skipped ${skippedFailedJobs}.`,
        );
        return;
      }

      setNotice(`Queued ${queuedTotal} failed transcode job${queuedTotal === 1 ? "" : "s"}.`);
    } catch (queueError) {
      setError(
        queueError instanceof Error
          ? queueError.message
          : "Could not requeue failed transcode jobs.",
      );
    } finally {
      setPendingReleaseId(null);
    }
  };

  return {
    onGenerateDownloadFormats,
    onForceRequeueTranscodes,
    onRequeueFailedTranscodes,
  };
}
