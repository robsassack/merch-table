import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

type JobSpec = {
  id: string;
  previewSeconds: number;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  attemptCount: number;
};

type PreviewAssetState = {
  id: string;
  trackId: string;
  storageKey: string;
  assetRole: "PREVIEW" | "MASTER" | "DELIVERY";
};

process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/merch_table_test";

let loadedPrisma: {
  $disconnect: () => Promise<void>;
} | null = null;

after(async () => {
  if (loadedPrisma) {
    await loadedPrisma.$disconnect().catch(() => undefined);
  }
});

function patchMethod(target: Record<string, unknown>, name: string, replacement: unknown) {
  const original = target[name];
  target[name] = replacement;
  return () => {
    target[name] = original;
  };
}

async function createFfmpegToolStubs(tmpRoot: string) {
  const binDir = path.join(tmpRoot, "bin");
  await fs.mkdir(binDir, { recursive: true });

  const ffmpegPath = path.join(binDir, "ffmpeg");
  const ffprobePath = path.join(binDir, "ffprobe");

  await fs.writeFile(
    ffmpegPath,
    `#!/usr/bin/env bash
set -euo pipefail
out="\${@: -1}"
mkdir -p "$(dirname "$out")"
printf 'fake-audio' > "$out"
`,
    "utf8",
  );

  await fs.writeFile(
    ffprobePath,
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "$*" == *"format=duration"* ]]; then
  printf '120.000\\n'
else
  printf '%s\\n' '{"streams":[{"bit_rate":"192000","sample_rate":"44100","channels":2}]}'
fi
`,
    "utf8",
  );

  await fs.chmod(ffmpegPath, 0o755);
  await fs.chmod(ffprobePath, 0o755);

  const previousPath = process.env.PATH ?? "";
  process.env.PATH = `${binDir}:${previousPath}`;

  return () => {
    process.env.PATH = previousPath;
  };
}

async function setupPreviewWorkerHarness(input: { jobs: JobSpec[] }) {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "worker-test-"));
  const restorePath = await createFfmpegToolStubs(tmpRoot);
  const sourceRoot = path.join(tmpRoot, "source");
  const outputRoot = path.join(tmpRoot, "output");

  process.env.TRANSCODE_SOURCE_ROOT = sourceRoot;
  process.env.TRANSCODE_OUTPUT_ROOT = outputRoot;
  process.env.STORAGE_MODE = "GARAGE";
  process.env.STORAGE_BUCKET = "test-media";
  process.env.STORAGE_REGION = "us-east-1";
  process.env.STORAGE_ENDPOINT = "http://localhost:3900";
  process.env.STORAGE_USE_PATH_STYLE = "true";
  process.env.STORAGE_ACCESS_KEY_ID = "test-key";
  process.env.STORAGE_SECRET_ACCESS_KEY = "test-secret";

  const workerModule = await import("@/lib/transcode/worker");
  const worker =
    (workerModule as { default?: unknown }).default ??
    (workerModule as unknown);
  const workerApi = worker as {
    processTranscodeQueueMessage: (message: {
      version: 1;
      kind: "PREVIEW_CLIP" | "DELIVERY_FORMATS";
      jobId: string;
      enqueuedAt: string;
    }) => Promise<void>;
  };

  const prismaModule = await import("@/lib/prisma");
  const prisma =
    (prismaModule as { default?: { prisma?: unknown }; prisma?: unknown }).default?.prisma ??
    (prismaModule as { prisma?: unknown }).prisma;
  if (!prisma) {
    throw new Error("Could not resolve Prisma client for worker test.");
  }
  const prismaClient = prisma as {
    $disconnect: () => Promise<void>;
    transcodeJob: unknown;
    trackAsset: unknown;
    $transaction: unknown;
  };
  loadedPrisma = prismaClient;

  const restore: Array<() => void> = [];
  const putKeys: string[] = [];
  const deleteKeys: string[] = [];
  let claimCallCount = 0;
  let findUniqueCallCount = 0;

  const jobs = new Map(input.jobs.map((job) => [job.id, { ...job }]));
  const previewAssetsByTrackAndKey = new Map<string, PreviewAssetState>();
  const previewAssetsById = new Map<string, PreviewAssetState>();
  let previewAssetCounter = 0;

  const restoreSend = patchMethod(
    S3Client.prototype as unknown as Record<string, unknown>,
    "send",
    async function send(command: unknown) {
      if (command instanceof GetObjectCommand) {
        return {
          Body: {
            transformToByteArray: async () => new Uint8Array([1, 2, 3, 4]),
          },
        };
      }

      if (command instanceof PutObjectCommand) {
        const key = command.input.Key;
        if (typeof key === "string") {
          putKeys.push(key);
        }

        return {};
      }

      if (command instanceof DeleteObjectCommand) {
        const key = command.input.Key;
        if (typeof key === "string") {
          deleteKeys.push(key);
        }

        return {};
      }

      return {};
    },
  );
  restore.push(restoreSend);

  restore.push(
    patchMethod(prismaClient.transcodeJob as unknown as Record<string, unknown>, "updateMany", async (args: {
      where: { id?: string; status?: string };
      data?: { status?: string; attemptCount?: { increment?: number } };
    }) => {
      claimCallCount += 1;
      const jobId = args.where.id;
      if (!jobId) {
        return { count: 0 };
      }

      const job = jobs.get(jobId);
      if (!job) {
        return { count: 0 };
      }

      if (args.where.status && job.status !== args.where.status) {
        return { count: 0 };
      }

      if (args.data?.status) {
        job.status = args.data.status as JobSpec["status"];
      }

      if (args.data?.attemptCount?.increment) {
        job.attemptCount += args.data.attemptCount.increment;
      }

      return { count: 1 };
    }),
  );

  restore.push(
    patchMethod(prismaClient.transcodeJob as unknown as Record<string, unknown>, "findUnique", async (args: {
      where: { id: string };
    }) => {
      findUniqueCallCount += 1;
      const job = jobs.get(args.where.id);
      if (!job) {
        return null;
      }

      return {
        id: job.id,
        organizationId: "org-1",
        trackId: "track-1",
        sourceAssetId: "source-1",
        jobKind: "PREVIEW_CLIP",
        attemptCount: job.attemptCount,
        track: {
          id: "track-1",
          previewSeconds: job.previewSeconds,
          release: {
            id: "release-1",
            deliveryFormats: ["MP3", "M4A", "FLAC"],
          },
        },
        sourceAsset: {
          id: "source-1",
          trackId: "track-1",
          storageKey: "masters/track-1.wav",
          format: "wav",
          isLossless: true,
        },
      };
    }),
  );

  restore.push(
    patchMethod(prismaClient.transcodeJob as unknown as Record<string, unknown>, "update", async (args: {
      where: { id: string };
      data: { status?: string };
    }) => {
      const job = jobs.get(args.where.id);
      if (job && args.data.status) {
        job.status = args.data.status as JobSpec["status"];
      }

      return { id: args.where.id };
    }),
  );

  restore.push(
    patchMethod(prismaClient as unknown as Record<string, unknown>, "$transaction", async <T>(
      callback: (tx: {
        trackAsset: {
          findUnique: (args: {
            where: { trackId_storageKey: { trackId: string; storageKey: string } };
          }) => Promise<{ id: string } | null>;
          upsert: (args: {
            where: { trackId_storageKey: { trackId: string; storageKey: string } };
            create: { trackId: string; storageKey: string; assetRole: "PREVIEW" | "DELIVERY" };
            update: { assetRole: "PREVIEW" | "DELIVERY" };
            select: { id: true };
          }) => Promise<{ id: string }>;
        };
        transcodeOutput: {
          upsert: (args: unknown) => Promise<unknown>;
        };
      }) => Promise<T>,
    ) => {
      const tx = {
        trackAsset: {
          findUnique: async (args: {
            where: { trackId_storageKey: { trackId: string; storageKey: string } };
          }) => {
            const key = `${args.where.trackId_storageKey.trackId}:${args.where.trackId_storageKey.storageKey}`;
            const existing = previewAssetsByTrackAndKey.get(key);
            return existing ? { id: existing.id } : null;
          },
          upsert: async (args: {
            where: { trackId_storageKey: { trackId: string; storageKey: string } };
            create: { trackId: string; storageKey: string; assetRole: "PREVIEW" | "DELIVERY" };
            update: { assetRole: "PREVIEW" | "DELIVERY" };
            select: { id: true };
          }) => {
            const trackId = args.where.trackId_storageKey.trackId;
            const storageKey = args.where.trackId_storageKey.storageKey;
            const mapKey = `${trackId}:${storageKey}`;
            const existing = previewAssetsByTrackAndKey.get(mapKey);

            if (existing) {
              const updated = {
                ...existing,
                assetRole: args.update.assetRole,
              };
              previewAssetsByTrackAndKey.set(mapKey, updated);
              previewAssetsById.set(updated.id, updated);
              return { id: updated.id };
            }

            previewAssetCounter += 1;
            const created: PreviewAssetState = {
              id: `preview-${previewAssetCounter}`,
              trackId: args.create.trackId,
              storageKey: args.create.storageKey,
              assetRole: args.create.assetRole,
            };
            previewAssetsByTrackAndKey.set(mapKey, created);
            previewAssetsById.set(created.id, created);
            return { id: created.id };
          },
        },
        transcodeOutput: {
          upsert: async () => ({}),
        },
      };

      return callback(tx);
    }),
  );

  restore.push(
    patchMethod(prismaClient.trackAsset as unknown as Record<string, unknown>, "findMany", async (args: {
      where: { trackId: string; assetRole: "PREVIEW"; storageKey: { not: string } };
      select: { id: true; storageKey: true };
    }) => {
      const keepStorageKey = args.where.storageKey.not;
      return Array.from(previewAssetsByTrackAndKey.values())
        .filter(
          (asset) =>
            asset.trackId === args.where.trackId &&
            asset.assetRole === "PREVIEW" &&
            asset.storageKey !== keepStorageKey,
        )
        .map((asset) => ({
          id: asset.id,
          storageKey: asset.storageKey,
        }));
    }),
  );

  restore.push(
    patchMethod(prismaClient.trackAsset as unknown as Record<string, unknown>, "deleteMany", async (args: {
      where: { id: { in: string[] } };
    }) => {
      const ids = new Set(args.where.id.in);
      for (const id of ids) {
        const existing = previewAssetsById.get(id);
        if (!existing) {
          continue;
        }

        previewAssetsById.delete(id);
        previewAssetsByTrackAndKey.delete(`${existing.trackId}:${existing.storageKey}`);
      }

      return { count: ids.size };
    }),
  );

  return {
    worker: workerApi,
    putKeys,
    deleteKeys,
    getClaimCallCount: () => claimCallCount,
    getFindUniqueCallCount: () => findUniqueCallCount,
    getPreviewAssetStorageKeys: () =>
      Array.from(previewAssetsByTrackAndKey.values())
        .filter((asset) => asset.assetRole === "PREVIEW")
        .map((asset) => asset.storageKey)
        .sort(),
    cleanup: async () => {
      for (let index = restore.length - 1; index >= 0; index -= 1) {
        restore[index]();
      }

      restorePath();
      await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => undefined);
    },
  };
}

describe("transcode worker queue behavior", () => {
  it("keeps preview output cleanup correct when previewSeconds is changed repeatedly", async () => {
    const harness = await setupPreviewWorkerHarness({
      jobs: [
        { id: "job-preview-1", previewSeconds: 12, status: "QUEUED", attemptCount: 0 },
        { id: "job-preview-2", previewSeconds: 24, status: "QUEUED", attemptCount: 0 },
        { id: "job-preview-3", previewSeconds: 36, status: "QUEUED", attemptCount: 0 },
      ],
    });

    try {
      await harness.worker.processTranscodeQueueMessage({
        version: 1,
        kind: "PREVIEW_CLIP",
        jobId: "job-preview-1",
        enqueuedAt: new Date().toISOString(),
      });
      await harness.worker.processTranscodeQueueMessage({
        version: 1,
        kind: "PREVIEW_CLIP",
        jobId: "job-preview-2",
        enqueuedAt: new Date().toISOString(),
      });
      await harness.worker.processTranscodeQueueMessage({
        version: 1,
        kind: "PREVIEW_CLIP",
        jobId: "job-preview-3",
        enqueuedAt: new Date().toISOString(),
      });

      const firstKey = "generated/previews/track-1/source-1-12s.mp3";
      const secondKey = "generated/previews/track-1/source-1-24s.mp3";
      const thirdKey = "generated/previews/track-1/source-1-36s.mp3";

      assert.deepEqual(harness.putKeys, [firstKey, secondKey, thirdKey]);
      assert.deepEqual(harness.deleteKeys, [firstKey, secondKey]);
      assert.deepEqual(harness.getPreviewAssetStorageKeys(), [thirdKey]);
    } finally {
      await harness.cleanup();
    }
  });

  it("processes a duplicated queue message only once under concurrent workers", async () => {
    const harness = await setupPreviewWorkerHarness({
      jobs: [
        { id: "job-concurrent-1", previewSeconds: 30, status: "QUEUED", attemptCount: 0 },
      ],
    });

    try {
      const duplicateMessage = {
        version: 1 as const,
        kind: "PREVIEW_CLIP" as const,
        jobId: "job-concurrent-1",
        enqueuedAt: new Date().toISOString(),
      };

      await Promise.all([
        harness.worker.processTranscodeQueueMessage(duplicateMessage),
        harness.worker.processTranscodeQueueMessage(duplicateMessage),
      ]);

      assert.equal(harness.getClaimCallCount(), 2);
      assert.equal(harness.getFindUniqueCallCount(), 1);
      assert.deepEqual(harness.putKeys, ["generated/previews/track-1/source-1-30s.mp3"]);
    } finally {
      await harness.cleanup();
    }
  });
});
