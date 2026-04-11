import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getStorageAdapterFromEnv } from "@/lib/storage/adapter";
import { getTranscodeQueueDepth } from "@/lib/transcode/queue";

export const runtime = "nodejs";

type ComponentStatus = {
  reachable: boolean;
  error: string | null;
};

export async function GET() {
  const checkedAt = new Date().toISOString();

  const database: ComponentStatus = {
    reachable: true,
    error: null,
  };
  const redis: ComponentStatus = {
    reachable: true,
    error: null,
  };
  const storage: ComponentStatus & {
    provider: "GARAGE" | "S3" | null;
    bucket: string | null;
  } = {
    reachable: true,
    error: null,
    provider: null,
    bucket: null,
  };

  try {
    await prisma.$queryRawUnsafe("SELECT 1");
  } catch (error) {
    database.reachable = false;
    database.error = error instanceof Error ? error.message : "Database check failed.";
  }

  try {
    await getTranscodeQueueDepth();
  } catch (error) {
    redis.reachable = false;
    redis.error = error instanceof Error ? error.message : "Redis check failed.";
  }

  try {
    const adapter = getStorageAdapterFromEnv();
    storage.provider = adapter.provider;
    storage.bucket = adapter.bucket;
    await adapter.validateAccess();
  } catch (error) {
    storage.reachable = false;
    storage.error = error instanceof Error ? error.message : "Storage check failed.";
  }

  const ready = database.reachable && redis.reachable && storage.reachable;

  return NextResponse.json(
    {
      ok: ready,
      status: ready ? "ready" : "degraded",
      checkedAt,
      components: {
        database,
        redis,
        storage,
      },
    },
    {
      status: ready ? 200 : 503,
      headers: {
        "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    },
  );
}
