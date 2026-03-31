import type { Prisma } from "@/generated/prisma/client";
import type { TranscodeJobKind } from "@/generated/prisma/enums";

type TranscodeTx = Prisma.TransactionClient;

function getAdvisoryLockScopeKey(input: {
  sourceAssetId: string;
  kind: TranscodeJobKind;
}) {
  return `${input.sourceAssetId}:${input.kind}`;
}

async function acquireTranscodeJobEnqueueLock(
  tx: TranscodeTx,
  input: {
    organizationId: string;
    sourceAssetId: string;
    kind: TranscodeJobKind;
  },
) {
  const scopeKey = getAdvisoryLockScopeKey({
    sourceAssetId: input.sourceAssetId,
    kind: input.kind,
  });

  // Serialize enqueue attempts for the same org/source/kind within a transaction.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.organizationId}), hashtext(${scopeKey}))`;
}

export async function createTranscodeJobWithActiveDedupe(
  tx: TranscodeTx,
  input: {
    organizationId: string;
    trackId: string;
    sourceAssetId: string;
    kind: TranscodeJobKind;
    kindSupported?: boolean;
  },
) {
  const kindSupported = input.kindSupported ?? true;

  await acquireTranscodeJobEnqueueLock(tx, {
    organizationId: input.organizationId,
    sourceAssetId: input.sourceAssetId,
    kind: kindSupported ? input.kind : "DELIVERY_FORMATS",
  });

  const existing = await tx.transcodeJob.findFirst({
    where: {
      organizationId: input.organizationId,
      sourceAssetId: input.sourceAssetId,
      ...(kindSupported
        ? { kind: input.kind }
        : { trackId: input.trackId }),
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
    status: "QUEUED",
  };
  if (kindSupported) {
    createdData.kind = input.kind;
  }

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
