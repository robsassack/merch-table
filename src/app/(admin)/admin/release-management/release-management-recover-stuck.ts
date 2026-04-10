import type { Dispatch, SetStateAction } from "react";

import type { useReleaseManagementState } from "./use-release-management-state";
import type { RecoverStuckTranscodesResponse } from "./types";

type ReleaseManagementState = ReturnType<typeof useReleaseManagementState>;

type SilentLoader = (options?: { silent?: boolean }) => Promise<void>;

type RecoverStuckInput = {
  setError: ReleaseManagementState["setError"];
  setTasksError: ReleaseManagementState["setTasksError"];
  setNotice: ReleaseManagementState["setNotice"];
  setRecoverStuckPending: Dispatch<SetStateAction<boolean>>;
  loadTasksStatus: SilentLoader;
  loadReleases: SilentLoader;
};

export async function recoverStuckTranscodeJobs({
  setError,
  setTasksError,
  setNotice,
  setRecoverStuckPending,
  loadTasksStatus,
  loadReleases,
}: RecoverStuckInput) {
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
}
