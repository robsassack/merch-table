import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { createTranscodeJobWithActiveDedupe } from "@/lib/transcode/job-dedupe";
import { enqueueDeliveryFormatsJob, enqueuePreviewClipJob } from "@/lib/transcode/queue";

import { adminTrackSelect, toAdminTrackRecord } from "./track-management";

type ExistingTrack = {
  id: string;
  previewMode: "CLIP" | "FULL" | "NONE" | null;
  assets: Array<{ id: string; isLossless: boolean }>;
  transcodeJobs: Array<{
    status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
    sourceAssetId: string;
    jobKind: "PREVIEW_CLIP" | "DELIVERY_FORMATS";
  }>;
};

type ReleaseScope = {
  id: string;
};

export async function requeueFailedTrackTranscodes(input: {
  existing: ExistingTrack;
  release: ReleaseScope;
  organizationId: string;
}) {
  let failedJobsFound = 0;
  let skippedFailedJobs = 0;

  const candidateByScopeKey = new Map<
    string,
    {
      sourceAssetId: string;
      jobKind: "PREVIEW_CLIP" | "DELIVERY_FORMATS";
    }
  >();
  const sourceAssetById = new Map(input.existing.assets.map((asset) => [asset.id, asset]));

  for (const job of input.existing.transcodeJobs) {
    if (job.status !== "FAILED") {
      continue;
    }

    failedJobsFound += 1;
    const sourceAsset = sourceAssetById.get(job.sourceAssetId);
    if (!sourceAsset) {
      skippedFailedJobs += 1;
      continue;
    }

    if (job.jobKind === "PREVIEW_CLIP" && input.existing.previewMode !== "CLIP") {
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
      sourceAssetId: job.sourceAssetId,
      jobKind: job.jobKind,
    });
  }

  const enqueueSummary = await prisma.$transaction(async (tx) => {
    const previewJobIds: string[] = [];
    const deliveryJobIds: string[] = [];
    let alreadyQueuedFailedJobs = 0;

    for (const candidate of candidateByScopeKey.values()) {
      const enqueueResult = await createTranscodeJobWithActiveDedupe(tx, {
        organizationId: input.organizationId,
        trackId: input.existing.id,
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

  let queuedPreviewJobs = 0;
  for (const jobId of enqueueSummary.previewJobIds) {
    try {
      await enqueuePreviewClipJob(jobId);
      queuedPreviewJobs += 1;
    } catch {
      skippedFailedJobs += 1;
      await prisma.transcodeJob
        .update({
          where: { id: jobId },
          data: {
            status: "FAILED",
            errorMessage: "Could not enqueue preview transcode job.",
            finishedAt: new Date(),
          },
        })
        .catch(() => undefined);
    }
  }

  let queuedDeliveryJobs = 0;
  for (const jobId of enqueueSummary.deliveryJobIds) {
    try {
      await enqueueDeliveryFormatsJob(jobId);
      queuedDeliveryJobs += 1;
    } catch {
      skippedFailedJobs += 1;
      await prisma.transcodeJob
        .update({
          where: { id: jobId },
          data: {
            status: "FAILED",
            errorMessage: "Could not enqueue delivery transcode job.",
            finishedAt: new Date(),
          },
        })
        .catch(() => undefined);
    }
  }

  const refreshed = await prisma.releaseTrack.findFirst({
    where: {
      id: input.existing.id,
      releaseId: input.release.id,
    },
    select: adminTrackSelect,
  });

  if (!refreshed) {
    return NextResponse.json(
      { ok: false, error: "Track not found after failed-job requeue action." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    track: toAdminTrackRecord(refreshed),
    failedJobsFound,
    skippedFailedJobs,
    queuedPreviewJobs,
    queuedDeliveryJobs,
    queuedTranscodeJobs: queuedPreviewJobs + queuedDeliveryJobs,
  });
}
