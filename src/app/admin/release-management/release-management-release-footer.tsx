import { formatIsoTimestampForDisplay } from "@/lib/time/format-display";

import { buttonClassName, dangerButtonClassName } from "./constants";
import type { ReleaseDraft, ReleaseRecord } from "./types";
import type { ReleaseManagementController } from "./use-release-management-controller";

export function ReleaseManagementReleaseFooter(props: {
  controller: ReleaseManagementController;
  release: ReleaseRecord;
  draft: ReleaseDraft;
  isPending: boolean;
  estimate:
    | {
        grossLabel: string;
        feeLabel: string;
        netLabel: string;
      }
    | null;
  latestTrackUpdatedAt: string | null;
}) {
  const { release, draft, isPending, estimate, latestTrackUpdatedAt } = props;
  const {
    createPending,
    coverUploadTarget,
    advancedById,
    setAdvancedById,
    onUpdateRelease,
    onSoftDeleteOrRestoreRelease,
    onGenerateDownloadFormats,
    onRequeueFailedTranscodes,
    onForceRequeueTranscodes,
    setPurgeDialogRelease,
    setPurgeConfirmInput,
  } = props.controller;
  const failedJobsCount = release.tracks.reduce(
    (count, track) =>
      count + track.transcodeJobs.filter((job) => job.status === "FAILED").length,
    0,
  );

  return (
    <>
      <p className="mt-3 text-xs text-zinc-500">
        Updated {formatIsoTimestampForDisplay(release.updatedAt)}
        {release.releaseDate
          ? ` • Release date ${formatIsoTimestampForDisplay(release.releaseDate)}`
          : ""}
        {release.deletedAt
          ? ` • Deleted ${formatIsoTimestampForDisplay(release.deletedAt)}`
          : ""}
        {release.publishedAt
          ? ` • Published ${formatIsoTimestampForDisplay(release.publishedAt)}`
          : ""}
      </p>
      {latestTrackUpdatedAt ? (
        <p className="mt-1 text-xs text-zinc-500">
          Last track update {formatIsoTimestampForDisplay(latestTrackUpdatedAt)}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={isPending || createPending}
          onClick={() =>
            setAdvancedById((previous) => ({
              ...previous,
              [release.id]: !previous[release.id],
            }))
          }
          className={`${buttonClassName} w-full sm:w-auto`}
        >
          {advancedById[release.id] ? "Hide Advanced" : "Advanced"}
        </button>

        <button
          type="button"
          disabled={
            isPending ||
            createPending ||
            coverUploadTarget === release.id ||
            draft.deliveryFormats.length === 0
          }
          onClick={() => void onUpdateRelease(release.id)}
          className={`${buttonClassName} w-full sm:w-auto`}
        >
          {isPending ? "Saving..." : "Save"}
        </button>

        {release.hasLosslessMasters && !release.deletedAt ? (
          <button
            type="button"
            disabled={isPending || createPending}
            onClick={() => void onGenerateDownloadFormats(release)}
            className={`${buttonClassName} w-full sm:w-auto`}
          >
            {isPending ? "Queueing..." : "Generate Download Formats"}
          </button>
        ) : null}

        {!release.deletedAt ? (
          <button
            type="button"
            disabled={isPending || createPending || failedJobsCount === 0}
            onClick={() => void onRequeueFailedTranscodes(release)}
            className={`${buttonClassName} w-full sm:w-auto`}
          >
            {isPending
              ? "Queueing..."
              : `Requeue Failed Jobs (${failedJobsCount})`}
          </button>
        ) : null}

        {!release.deletedAt && advancedById[release.id] ? (
          <button
            type="button"
            disabled={isPending || createPending || release.tracks.length === 0}
            onClick={() => {
              const confirmed = globalThis.confirm(
                "Force requeue will queue preview and delivery jobs for all eligible tracks in this release, not only failed jobs. Continue?",
              );
              if (!confirmed) {
                return;
              }

              void onForceRequeueTranscodes(release);
            }}
            className={`${buttonClassName} w-full sm:w-auto`}
          >
            {isPending ? "Queueing..." : "Force Requeue Jobs"}
          </button>
        ) : null}

        <button
          type="button"
          disabled={isPending || createPending}
          onClick={() => void onSoftDeleteOrRestoreRelease(release)}
          className={`${buttonClassName} w-full sm:w-auto`}
        >
          {isPending
            ? release.deletedAt
              ? "Restoring..."
              : "Deleting..."
            : release.deletedAt
              ? "Restore"
              : "Soft Delete"}
        </button>

        {release.deletedAt ? (
          <button
            type="button"
            disabled={isPending || createPending}
            onClick={() => {
              setPurgeDialogRelease(release);
              setPurgeConfirmInput("");
            }}
            className={`${dangerButtonClassName} w-full sm:w-auto`}
          >
            {isPending ? "Purging..." : "Permanent Purge"}
          </button>
        ) : null}
      </div>

      {estimate && draft.pricingMode !== "FREE" ? (
        <p className="mt-2 text-xs text-zinc-500">
          Preview: {estimate.grossLabel} gross • ~{estimate.feeLabel} fee • ~{estimate.netLabel}{" "}
          payout
        </p>
      ) : null}
    </>
  );
}
