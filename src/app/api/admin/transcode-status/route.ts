import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdminRequestContext } from "@/lib/admin/request-context";
import { getStorageAdapterFromEnv } from "@/lib/storage/adapter";
import {
  getTranscodeQueueDepth,
  readTranscodeWorkerHeartbeat,
} from "@/lib/transcode/queue";

export const runtime = "nodejs";

const DEFAULT_HEARTBEAT_STALE_AFTER_SECONDS = 45;
const DEFAULT_FAILED_EMAIL_WINDOW_DAYS = 7;

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
  const failedEmailWindowDays = parsePositiveInteger(
    process.env.ADMIN_STATUS_FAILED_EMAIL_WINDOW_DAYS,
    DEFAULT_FAILED_EMAIL_WINDOW_DAYS,
  );

  const now = new Date();
  const warnings: string[] = [];
  const recentFailedEmailsSince = new Date(now.getTime() - failedEmailWindowDays * 24 * 60 * 60 * 1_000);

  let queueDepth: number | null = null;
  let redisReachable = true;
  let redisError: string | null = null;
  try {
    queueDepth = await getTranscodeQueueDepth();
  } catch (error) {
    redisReachable = false;
    redisError = error instanceof Error ? error.message : "Redis check failed.";
    warnings.push("Queue depth is unavailable.");
  }

  let lastWorkerHeartbeatAt: string | null = null;
  try {
    lastWorkerHeartbeatAt = await readTranscodeWorkerHeartbeat();
  } catch {
    redisReachable = false;
    redisError = redisError ?? "Redis heartbeat check failed.";
    warnings.push("Worker heartbeat is unavailable.");
  }

  let databaseReachable = true;
  let databaseError: string | null = null;
  let queuedJobs = 0;
  let runningJobs = 0;
  let latestSuccess: { finishedAt: Date | null } | null = null;
  let recentFailedEmailCount = 0;
  let totalTrackAssetSizeBytes = 0;
  try {
    const [queued, running, latest, failedCount, trackAssetSizeSummary] = await Promise.all([
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
      prisma.order.count({
        where: {
          organizationId: auth.context.organizationId,
          emailStatus: "FAILED",
          updatedAt: {
            gte: recentFailedEmailsSince,
          },
        },
      }),
      prisma.trackAsset.aggregate({
        where: {
          track: {
            release: {
              organizationId: auth.context.organizationId,
            },
          },
        },
        _sum: {
          fileSizeBytes: true,
        },
      }),
    ]);
    queuedJobs = queued;
    runningJobs = running;
    latestSuccess = latest;
    recentFailedEmailCount = failedCount;
    totalTrackAssetSizeBytes = trackAssetSizeSummary._sum.fileSizeBytes ?? 0;
  } catch (error) {
    databaseReachable = false;
    databaseError = error instanceof Error ? error.message : "Database check failed.";
    warnings.push("Database-dependent status details are unavailable.");
  }

  let storageReachable = true;
  let storageError: string | null = null;
  let storageProvider: "GARAGE" | "S3" | null = null;
  let storageBucket: string | null = null;
  try {
    const storage = getStorageAdapterFromEnv();
    storageProvider = storage.provider;
    storageBucket = storage.bucket;
    await storage.validateAccess();
  } catch (error) {
    storageReachable = false;
    storageError = error instanceof Error ? error.message : "Storage check failed.";
    warnings.push("Storage reachability is unavailable.");
  }

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
      serviceConnectivity: {
        database: {
          reachable: databaseReachable,
          error: databaseError,
        },
        redis: {
          reachable: redisReachable,
          error: redisError,
        },
        storage: {
          reachable: storageReachable,
          error: storageError,
          provider: storageProvider,
          bucket: storageBucket,
        },
      },
      emailAndStorageMetrics: {
        recentFailedEmailCount,
        recentFailedEmailWindowDays: failedEmailWindowDays,
        recentFailedEmailsSince: recentFailedEmailsSince.toISOString(),
        totalTrackAssetSizeBytes,
      },
      warnings,
    },
  });
}
