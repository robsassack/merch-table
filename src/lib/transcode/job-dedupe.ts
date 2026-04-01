import type { Prisma } from "@/generated/prisma/client";
import type { TranscodeJobKind } from "@/generated/prisma/enums";

type TranscodeTx = Prisma.TransactionClient;

function getAdvisoryLockScopeKey(input: {
  sourceAssetId: string;
  jobKind: TranscodeJobKind;
}) {
  return `${input.sourceAssetId}:${input.jobKind}`;
}

async function acquireTranscodeJobEnqueueLock(
  tx: TranscodeTx,
  input: {
    organizationId: string;
    sourceAssetId: string;
    jobKind: TranscodeJobKind;
  },
) {
  const scopeKey = getAdvisoryLockScopeKey({
    sourceAssetId: input.sourceAssetId,
    jobKind: input.jobKind,
  });

  // Serialize enqueue attempts for the same org/source/jobKind within a transaction.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.organizationId}), hashtext(${scopeKey}))`;
}

export async function createTranscodeJobWithActiveDedupe(
  tx: TranscodeTx,
  input: {
    organizationId: string;
    trackId: string;
    sourceAssetId: string;
    jobKind: TranscodeJobKind;
  },
) {
  await acquireTranscodeJobEnqueueLock(tx, {
    organizationId: input.organizationId,
    sourceAssetId: input.sourceAssetId,
    jobKind: input.jobKind,
  });

  const existing = await tx.transcodeJob.findFirst({
    where: {
      organizationId: input.organizationId,
      sourceAssetId: input.sourceAssetId,
      jobKind: input.jobKind,
      status: {
        in: ["QUEUED", "RUNNING"],
      },
    },
    select: {
      id: true,
    },
  });

  if (existing) {
    return {
      created: false,
      jobId: existing.id,
    } as const;
  }

  const createdData: Record<string, unknown> = {
    organizationId: input.organizationId,
    trackId: input.trackId,
    sourceAssetId: input.sourceAssetId,
    jobKind: input.jobKind,
    status: "QUEUED",
  };

  const created = await tx.transcodeJob.create({
    data: createdData as never,
    select: {
      id: true,
    },
  });

  return {
    created: true,
    jobId: created.id,
  } as const;
}
