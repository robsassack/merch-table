import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdminRequestContext } from "@/lib/admin/request-context";
import {
  getTranscodeQueueDepth,
  readTranscodeWorkerHeartbeat,
} from "@/lib/transcode/queue";

export const runtime = "nodejs";

const DEFAULT_HEARTBEAT_STALE_AFTER_SECONDS = 45;

function parsePositiveInteger(raw: string | undefined, fallback: number) {
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function resolveWorkerUp(input: {
  lastHeartbeatAtIso: string | null;
  staleAfterSeconds: number;
  now: Date;
}) {
  if (!input.lastHeartbeatAtIso) {
    return false;
  }

  const heartbeatAt = new Date(input.lastHeartbeatAtIso);
  if (Number.isNaN(heartbeatAt.getTime())) {
    return false;
  }

  const ageMs = input.now.getTime() - heartbeatAt.getTime();
  return ageMs <= input.staleAfterSeconds * 1_000;
}

export async function GET() {
  const auth = await requireAdminRequestContext();
  if (!auth.ok) {
    return auth.response;
  }

  const staleAfterSeconds = parsePositiveInteger(
    process.env.TRANSCODE_WORKER_HEARTBEAT_STALE_AFTER_SECONDS,
    DEFAULT_HEARTBEAT_STALE_AFTER_SECONDS,
  );

  const now = new Date();
  const warnings: string[] = [];

  let queueDepth: number | null = null;
  try {
    queueDepth = await getTranscodeQueueDepth();
  } catch {
    warnings.push("Queue depth is unavailable.");
  }

  let lastWorkerHeartbeatAt: string | null = null;
  try {
    lastWorkerHeartbeatAt = await readTranscodeWorkerHeartbeat();
  } catch {
    warnings.push("Worker heartbeat is unavailable.");
  }

  const [queuedJobs, runningJobs, latestSuccess] = await Promise.all([
    prisma.transcodeJob.count({
      where: {
        organizationId: auth.context.organizationId,
        status: "QUEUED",
      },
    }),
    prisma.transcodeJob.count({
      where: {
        organizationId: auth.context.organizationId,
        status: "RUNNING",
      },
    }),
    prisma.transcodeJob.findFirst({
      where: {
        organizationId: auth.context.organizationId,
        status: "SUCCEEDED",
      },
      orderBy: [{ finishedAt: "desc" }, { updatedAt: "desc" }],
      select: {
        finishedAt: true,
      },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    status: {
      queueDepth,
      queuedJobs,
      runningJobs,
      workerUp: resolveWorkerUp({
        lastHeartbeatAtIso: lastWorkerHeartbeatAt,
        staleAfterSeconds,
        now,
      }),
      lastWorkerHeartbeatAt,
      workerStaleAfterSeconds: staleAfterSeconds,
      lastSuccessfulJobAt: latestSuccess?.finishedAt?.toISOString() ?? null,
      checkedAt: now.toISOString(),
      warnings,
    },
  });
}
