import type { Prisma } from "@/generated/prisma/client";
import { NextResponse } from "next/server";

import { toAdminReleaseRecord } from "@/lib/admin/release-management";
import { prisma } from "@/lib/prisma";
import { createTranscodeJobWithActiveDedupe } from "@/lib/transcode/job-dedupe";
import { enqueueDeliveryFormatsJob, enqueuePreviewClipJob } from "@/lib/transcode/queue";

import {
  type CancelReleaseTranscodesAction,
  type ForceRequeueTranscodesAction,
  type GenerateDownloadFormatsAction,
  type ReleaseForActionState,
  type ReleaseTrackState,
  type RequeueFailedTranscodesAction,
} from "../release-route-types";
import { enqueueJobIds, errorResponse, refreshReleaseForResponse } from "../release-route-utils";

type TranscodeCandidate = {
  trackId: string;
  sourceAssetId: string;
};

function getLatestMasterAsset(
  track: ReleaseTrackState,
  input?: { requireLossless?: boolean },
) {
  return track.assets
    .filter(
      (asset) =>
        asset.assetRole === "MASTER" && (!input?.requireLossless || asset.isLossless),
    )
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
}

function collectLosslessMasterCandidates(release: ReleaseForActionState) {
  return release.tracks
    .map((track) => {
      const sourceAsset = track.assets.find(
        (asset) => asset.assetRole === "MASTER" && asset.isLossless,
      );
      if (!sourceAsset) {
        return null;
      }

      return {
        trackId: track.id,
        sourceAssetId: sourceAsset.id,
      };
    })
    .filter((entry): entry is TranscodeCandidate => entry !== null);
}

function collectForceRequeueCandidates(release: ReleaseForActionState) {
  const previewCandidates = release.tracks
    .map((track) => {
      if (track.previewMode !== "CLIP") {
        return null;
      }

      const sourceAsset = getLatestMasterAsset(track);
      if (!sourceAsset) {
        return null;
      }

      return {
        trackId: track.id,
        sourceAssetId: sourceAsset.id,
      };
    })
    .filter((entry): entry is TranscodeCandidate => entry !== null);

  const deliveryCandidates = release.tracks
    .map((track) => {
      const sourceAsset = getLatestMasterAsset(track, { requireLossless: true });
      if (!sourceAsset) {
        return null;
      }

      return {
        trackId: track.id,
        sourceAssetId: sourceAsset.id,
      };
    })
    .filter((entry): entry is TranscodeCandidate => entry !== null);

  return {
    previewCandidates,
    deliveryCandidates,
  };
}

function collectFailedJobRequeueCandidates(release: ReleaseForActionState) {
  let failedJobsFound = 0;
  let skippedFailedJobs = 0;
  const candidateByScopeKey = new Map<
    string,
    {
      trackId: string;
      sourceAssetId: string;
      jobKind: "PREVIEW_CLIP" | "DELIVERY_FORMATS";
    }
  >();

  for (const track of release.tracks) {
    const sourceAssetById = new Map(track.assets.map((asset) => [asset.id, asset]));
    for (const job of track.transcodeJobs) {
      if (job.status !== "FAILED") {
        continue;
      }

      failedJobsFound += 1;

      const sourceAsset = sourceAssetById.get(job.sourceAssetId);
      if (!sourceAsset) {
        skippedFailedJobs += 1;
        continue;
      }

      if (job.jobKind === "PREVIEW_CLIP" && track.previewMode !== "CLIP") {
        skippedFailedJobs += 1;
        continue;
      }

      if (job.jobKind === "DELIVERY_FORMATS" && !sourceAsset.isLossless) {
        skippedFailedJobs += 1;
        continue;
      }

      const scopeKey = `${job.jobKind}:${job.sourceAssetId}`;
      if (candidateByScopeKey.has(scopeKey)) {
        skippedFailedJobs += 1;
        continue;
      }

      candidateByScopeKey.set(scopeKey, {
        trackId: track.id,
        sourceAssetId: job.sourceAssetId,
        jobKind: job.jobKind,
      });
    }
  }

  return {
    failedJobsFound,
    skippedFailedJobs,
    candidateByScopeKey,
  };
}

export async function handleGenerateDownloadFormatsAction<TSelect extends Prisma.ReleaseSelect>(
  input: {
  parsed: GenerateDownloadFormatsAction;
  release: ReleaseForActionState;
  organizationId: string;
  deliveryFormatsSupported: boolean;
  releaseSelect: TSelect;
},
) {
  const { release, organizationId, deliveryFormatsSupported, releaseSelect } = input;

  if (
    deliveryFormatsSupported &&
    Array.isArray(release.deliveryFormats) &&
    release.deliveryFormats.length === 0
  ) {
    return errorResponse(
      "No delivery formats are enabled for this release. Select at least one format and save first.",
      409,
    );
  }

  const losslessMasters = collectLosslessMasterCandidates(release);

  if (losslessMasters.length === 0) {
    return errorResponse(
      "No lossless master assets were found on this release. Upload at least one lossless master first.",
      409,
    );
  }

  const enqueueSummary = await prisma.$transaction(async (tx) => {
    const queuedJobIds: string[] = [];
    let alreadyQueuedJobs = 0;

    for (const candidate of losslessMasters) {
      const enqueueResult = await createTranscodeJobWithActiveDedupe(tx, {
        organizationId,
        trackId: candidate.trackId,
        sourceAssetId: candidate.sourceAssetId,
        jobKind: "DELIVERY_FORMATS",
      });

      if (!enqueueResult.created) {
        alreadyQueuedJobs += 1;
        continue;
      }

      queuedJobIds.push(enqueueResult.jobId);
    }

    return {
      queuedJobIds,
      alreadyQueuedJobs,
    };
  });

  const queuedTranscodeJobs = await enqueueJobIds({
    jobIds: enqueueSummary.queuedJobIds,
    enqueue: enqueueDeliveryFormatsJob,
    failureMessage: "Could not enqueue delivery transcode job.",
  });

  const refreshedResult = await refreshReleaseForResponse({
    releaseId: release.id,
    organizationId,
    releaseSelect,
    notFoundMessage: "Release not found after queuing transcode jobs.",
  });
  if ("response" in refreshedResult) {
    return refreshedResult.response;
  }

  return NextResponse.json({
    ok: true,
    release: toAdminReleaseRecord(
      refreshedResult.release as Parameters<typeof toAdminReleaseRecord>[0],
    ),
    queuedTranscodeJobs,
    alreadyQueuedJobs: enqueueSummary.alreadyQueuedJobs,
  });
}

export async function handleForceRequeueTranscodesAction<TSelect extends Prisma.ReleaseSelect>(
  input: {
  parsed: ForceRequeueTranscodesAction;
  release: ReleaseForActionState;
  organizationId: string;
  releaseSelect: TSelect;
},
) {
  const { release, organizationId, releaseSelect } = input;

  const { previewCandidates, deliveryCandidates } = collectForceRequeueCandidates(release);

  if (previewCandidates.length === 0 && deliveryCandidates.length === 0) {
    return errorResponse(
      "No eligible master assets found to force requeue preview or delivery jobs.",
      409,
    );
  }

  const enqueueSummary = await prisma.$transaction(async (tx) => {
    const previewJobIds: string[] = [];
    const deliveryJobIds: string[] = [];

    for (const candidate of previewCandidates) {
      const queuedJob = await tx.transcodeJob.create({
        data: {
          organizationId,
          trackId: candidate.trackId,
          sourceAssetId: candidate.sourceAssetId,
          jobKind: "PREVIEW_CLIP",
          status: "QUEUED",
        },
        select: {
          id: true,
        },
      });
      previewJobIds.push(queuedJob.id);
    }

    for (const candidate of deliveryCandidates) {
      const enqueueResult = await createTranscodeJobWithActiveDedupe(tx, {
        organizationId,
        trackId: candidate.trackId,
        sourceAssetId: candidate.sourceAssetId,
        jobKind: "DELIVERY_FORMATS",
      });

      if (!enqueueResult.created) {
        continue;
      }

      deliveryJobIds.push(enqueueResult.jobId);
    }

    return {
      previewJobIds,
      deliveryJobIds,
    };
  });

  const queuedPreviewJobs = await enqueueJobIds({
    jobIds: enqueueSummary.previewJobIds,
    enqueue: enqueuePreviewClipJob,
    failureMessage: "Could not enqueue preview transcode job.",
  });
  const queuedDeliveryJobs = await enqueueJobIds({
    jobIds: enqueueSummary.deliveryJobIds,
    enqueue: enqueueDeliveryFormatsJob,
    failureMessage: "Could not enqueue delivery transcode job.",
  });

  const refreshedResult = await refreshReleaseForResponse({
    releaseId: release.id,
    organizationId,
    releaseSelect,
    notFoundMessage: "Release not found after force requeue action.",
  });
  if ("response" in refreshedResult) {
    return refreshedResult.response;
  }

  return NextResponse.json({
    ok: true,
    release: toAdminReleaseRecord(
      refreshedResult.release as Parameters<typeof toAdminReleaseRecord>[0],
    ),
    queuedPreviewJobs,
    queuedDeliveryJobs,
    queuedTranscodeJobs: queuedPreviewJobs + queuedDeliveryJobs,
  });
}

export async function handleRequeueFailedTranscodesAction<TSelect extends Prisma.ReleaseSelect>(
  input: {
  parsed: RequeueFailedTranscodesAction;
  release: ReleaseForActionState;
  organizationId: string;
  releaseSelect: TSelect;
},
) {
  const { release, organizationId, releaseSelect } = input;

  const failedCandidates = collectFailedJobRequeueCandidates(release);
  const { failedJobsFound, candidateByScopeKey } = failedCandidates;
  let skippedFailedJobs = failedCandidates.skippedFailedJobs;

  const enqueueSummary = await prisma.$transaction(async (tx) => {
    const previewJobIds: string[] = [];
    const deliveryJobIds: string[] = [];
    let alreadyQueuedFailedJobs = 0;

    for (const candidate of candidateByScopeKey.values()) {
      const enqueueResult = await createTranscodeJobWithActiveDedupe(tx, {
        organizationId,
        trackId: candidate.trackId,
        sourceAssetId: candidate.sourceAssetId,
        jobKind: candidate.jobKind,
      });

      if (!enqueueResult.created) {
        alreadyQueuedFailedJobs += 1;
        continue;
      }

      if (candidate.jobKind === "PREVIEW_CLIP") {
        previewJobIds.push(enqueueResult.jobId);
      } else {
        deliveryJobIds.push(enqueueResult.jobId);
      }
    }

    return {
      previewJobIds,
      deliveryJobIds,
      alreadyQueuedFailedJobs,
    };
  });

  skippedFailedJobs += enqueueSummary.alreadyQueuedFailedJobs;

  const queuedPreviewJobs = await enqueueJobIds({
    jobIds: enqueueSummary.previewJobIds,
    enqueue: enqueuePreviewClipJob,
    failureMessage: "Could not enqueue preview transcode job.",
    onEnqueueError: () => {
      skippedFailedJobs += 1;
    },
  });
  const queuedDeliveryJobs = await enqueueJobIds({
    jobIds: enqueueSummary.deliveryJobIds,
    enqueue: enqueueDeliveryFormatsJob,
    failureMessage: "Could not enqueue delivery transcode job.",
    onEnqueueError: () => {
      skippedFailedJobs += 1;
    },
  });

  const refreshedResult = await refreshReleaseForResponse({
    releaseId: release.id,
    organizationId,
    releaseSelect,
    notFoundMessage: "Release not found after failed-job requeue action.",
  });
  if ("response" in refreshedResult) {
    return refreshedResult.response;
  }

  return NextResponse.json({
    ok: true,
    release: toAdminReleaseRecord(
      refreshedResult.release as Parameters<typeof toAdminReleaseRecord>[0],
    ),
    failedJobsFound,
    skippedFailedJobs,
    queuedPreviewJobs,
    queuedDeliveryJobs,
    queuedTranscodeJobs: queuedPreviewJobs + queuedDeliveryJobs,
  });
}

export async function handleCancelReleaseTranscodesAction<TSelect extends Prisma.ReleaseSelect>(
  input: {
  parsed: CancelReleaseTranscodesAction;
  release: ReleaseForActionState;
  organizationId: string;
  releaseSelect: TSelect;
},
) {
  const { release, organizationId, releaseSelect } = input;
  const canceledAt = new Date();
  const cancelErrorMessage = "Canceled by admin from release management.";

  const [canceledQueuedResult, canceledRunningResult] = await prisma.$transaction([
    prisma.transcodeJob.updateMany({
      where: {
        track: {
          releaseId: release.id,
          release: {
            organizationId,
          },
        },
        status: "QUEUED",
      },
      data: {
        status: "FAILED",
        errorMessage: cancelErrorMessage,
        finishedAt: canceledAt,
        nextRetryAt: null,
      },
    }),
    prisma.transcodeJob.updateMany({
      where: {
        track: {
          releaseId: release.id,
          release: {
            organizationId,
          },
        },
        status: "RUNNING",
      },
      data: {
        status: "FAILED",
        errorMessage: cancelErrorMessage,
        finishedAt: canceledAt,
        nextRetryAt: null,
      },
    }),
  ]);

  const refreshedResult = await refreshReleaseForResponse({
    releaseId: release.id,
    organizationId,
    releaseSelect,
    notFoundMessage: "Release not found after canceling transcode jobs.",
  });
  if ("response" in refreshedResult) {
    return refreshedResult.response;
  }

  return NextResponse.json({
    ok: true,
    release: toAdminReleaseRecord(
      refreshedResult.release as Parameters<typeof toAdminReleaseRecord>[0],
    ),
    canceledQueuedJobs: canceledQueuedResult.count,
    canceledRunningJobs: canceledRunningResult.count,
    canceledTranscodeJobs: canceledQueuedResult.count + canceledRunningResult.count,
  });
}
