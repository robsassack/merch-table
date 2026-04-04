import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

type AnyRecord = Record<string, unknown>;

function patchMethod(target: AnyRecord, name: string, replacement: unknown) {
  const original = target[name];
  target[name] = replacement;
  return () => {
    target[name] = original;
  };
}

describe("GET /api/library/:token", () => {
  const restore: Array<() => void> = [];

  afterEach(() => {
    while (restore.length > 0) {
      const fn = restore.pop();
      fn?.();
    }
  });

  it("returns downloads and updates access tracking for a valid token", async () => {
    process.env.DATABASE_URL ??=
      "postgresql://postgres:postgres@localhost:5432/merch_table_test";
    const { prisma } = await import("@/lib/prisma");

    restore.push(
      patchMethod(
        prisma.buyerLibraryToken as unknown as AnyRecord,
        "findUnique",
        async () => ({
          id: "lib-token-1",
          customerId: "customer-1",
          revokedAt: null,
          expiresAt: null,
        }),
      ),
    );

    restore.push(
      patchMethod(
        prisma.buyerLibraryToken as unknown as AnyRecord,
        "update",
        async () => ({
          lastUsedAt: new Date("2026-04-04T12:00:00.000Z"),
          accessCount: 3,
          expiresAt: null,
        }),
      ),
    );

    restore.push(
      patchMethod(
        prisma.downloadEntitlement as unknown as AnyRecord,
        "findMany",
        async () => [
          {
            token: "ent-1",
            createdAt: new Date("2026-04-04T10:00:00.000Z"),
            releaseFileId: "file-1",
            releaseFile: {
              id: "file-1",
              fileName: "01 - Track One.flac",
              sizeBytes: 123456,
              mimeType: "audio/flac",
            },
            release: {
              id: "release-1",
              title: "Release One",
              slug: "release-one",
              coverImageUrl: null,
              artist: {
                name: "Artist One",
              },
            },
            orderItem: {
              order: {
                id: "order-1",
                orderNumber: "ORDER-1",
                paidAt: new Date("2026-04-03T12:00:00.000Z"),
                createdAt: new Date("2026-04-03T12:00:00.000Z"),
              },
            },
          },
        ],
      ),
    );

    const { GET } = await import("@/app/api/library/[token]/route");

    const response = await GET(new Request("http://localhost:3000/api/library/lib-token"), {
      params: Promise.resolve({ token: "lib-token" }),
    });

    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get("cache-control"),
      "no-store, no-cache, must-revalidate, proxy-revalidate",
    );

    const payload = (await response.json()) as {
      ok: boolean;
      libraryToken: { accessCount: number };
      availableDownloadFormatsByReleaseId: Record<string, string[]>;
      downloads: Array<{ downloadPath: string; format: string | null }>;
    };

    assert.equal(payload.ok, true);
    assert.equal(payload.libraryToken.accessCount, 3);
    assert.equal(payload.downloads.length, 1);
    assert.equal(payload.downloads[0]?.downloadPath, "/api/download/ent-1/file-1");
    assert.equal(payload.downloads[0]?.format, "flac");
    assert.deepEqual(payload.availableDownloadFormatsByReleaseId["release-1"], [
      "flac",
    ]);
  });

  it("returns 403 when the token has expired", async () => {
    process.env.DATABASE_URL ??=
      "postgresql://postgres:postgres@localhost:5432/merch_table_test";
    const { prisma } = await import("@/lib/prisma");

    restore.push(
      patchMethod(
        prisma.buyerLibraryToken as unknown as AnyRecord,
        "findUnique",
        async () => ({
          id: "lib-token-2",
          customerId: "customer-1",
          revokedAt: null,
          expiresAt: new Date("2026-04-04T00:00:00.000Z"),
        }),
      ),
    );

    const { GET } = await import("@/app/api/library/[token]/route");
    const response = await GET(new Request("http://localhost:3000/api/library/lib-token"), {
      params: Promise.resolve({ token: "lib-token" }),
    });

    assert.equal(response.status, 403);
  });
});
