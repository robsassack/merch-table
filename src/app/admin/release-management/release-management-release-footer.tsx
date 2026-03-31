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
    onForceRequeueTranscodes,
    setPurgeDialogRelease,
    setPurgeConfirmInput,
  } = props.controller;

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
          className={buttonClassName}
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
          className={buttonClassName}
        >
          {isPending ? "Saving..." : "Save"}
        </button>

        {release.hasLosslessMasters && !release.deletedAt ? (
          <button
            type="button"
            disabled={isPending || createPending}
            onClick={() => void onGenerateDownloadFormats(release)}
            className={buttonClassName}
          >
            {isPending ? "Queueing..." : "Generate Download Formats"}
          </button>
        ) : null}

        {!release.deletedAt ? (
          <button
            type="button"
            disabled={isPending || createPending || release.tracks.length === 0}
            onClick={() => void onForceRequeueTranscodes(release)}
            className={buttonClassName}
          >
            {isPending ? "Queueing..." : "Force Requeue Jobs"}
          </button>
        ) : null}

        <button
          type="button"
          disabled={isPending || createPending}
          onClick={() => void onSoftDeleteOrRestoreRelease(release)}
          className={buttonClassName}
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
            className={dangerButtonClassName}
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
