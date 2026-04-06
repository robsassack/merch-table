import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { OWNED_RELEASE_HINT_COOKIE_NAME } from "@/lib/checkout/owned-release-hint-cookie";

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
    delete process.env.AUTH_SECRET;
  });

  it("returns downloads and updates access tracking for a valid token", async () => {
    process.env.AUTH_SECRET = "test-secret";
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

    let buyerLibraryTokenUpdateInput: AnyRecord | null = null;
    restore.push(
      patchMethod(
        prisma.buyerLibraryToken as unknown as AnyRecord,
        "update",
        async (input: AnyRecord) => {
          buyerLibraryTokenUpdateInput = input;
          return {
            lastUsedAt: new Date("2026-04-04T12:00:00.000Z"),
            accessCount: 3,
            expiresAt: null,
          };
        },
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
    restore.push(
      patchMethod(prisma.orderItem as unknown as AnyRecord, "findMany", async () => []),
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
    const setCookie = response.headers.get("set-cookie");
    assert.ok(setCookie);
    assert.ok(setCookie?.includes(`${OWNED_RELEASE_HINT_COOKIE_NAME}=`));

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
    assert.ok(buyerLibraryTokenUpdateInput);
    const updateInput = buyerLibraryTokenUpdateInput as AnyRecord;
    assert.equal((updateInput.where as AnyRecord)?.id, "lib-token-1");
    assert.equal(
      ((updateInput.data as AnyRecord)?.accessCount as AnyRecord)?.increment,
      1,
    );
    assert.ok(((updateInput.data as AnyRecord)?.lastUsedAt as unknown) instanceof Date);
  });

  it("adds missing entitlements for newly added release files before returning library downloads", async () => {
    process.env.DATABASE_URL ??=
      "postgresql://postgres:postgres@localhost:5432/merch_table_test";
    const { prisma } = await import("@/lib/prisma");

    restore.push(
      patchMethod(
        prisma.buyerLibraryToken as unknown as AnyRecord,
        "findUnique",
        async () => ({
          id: "lib-token-3",
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
          accessCount: 4,
          expiresAt: null,
        }),
      ),
    );

    let entitlementReadCount = 0;
    restore.push(
      patchMethod(
        prisma.downloadEntitlement as unknown as AnyRecord,
        "findMany",
        async () => {
          entitlementReadCount += 1;
          if (entitlementReadCount === 1) {
            return [
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
            ];
          }

          return [
            {
              token: "ent-2",
              createdAt: new Date("2026-04-04T11:00:00.000Z"),
              releaseFileId: "file-2",
              releaseFile: {
                id: "file-2",
                fileName: "02 - New Song.flac",
                sizeBytes: 654321,
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
          ];
        },
      ),
    );

    restore.push(
      patchMethod(
        prisma.orderItem as unknown as AnyRecord,
        "findMany",
        async () => [
          {
            id: "order-item-1",
            releaseId: "release-1",
            release: {
              organizationId: "org-1",
            },
          },
        ],
      ),
    );
    restore.push(
      patchMethod(
        prisma.trackAsset as unknown as AnyRecord,
        "findMany",
        async () => [],
      ),
    );
    restore.push(
      patchMethod(
        prisma.releaseFile as unknown as AnyRecord,
        "findMany",
        async () => [
          { id: "file-1", releaseId: "release-1" },
          { id: "file-2", releaseId: "release-1" },
        ],
      ),
    );

    let createManyInput: AnyRecord | null = null;
    restore.push(
      patchMethod(
        prisma.downloadEntitlement as unknown as AnyRecord,
        "createMany",
        async (input: AnyRecord) => {
          createManyInput = input;
          return { count: 1 };
        },
      ),
    );

    const { GET } = await import("@/app/api/library/[token]/route");
    const response = await GET(new Request("http://localhost:3000/api/library/lib-token"), {
      params: Promise.resolve({ token: "lib-token" }),
    });

    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      ok: boolean;
      downloads: Array<{ fileName: string }>;
    };
    assert.equal(payload.ok, true);
    assert.equal(payload.downloads.length, 2);
    assert.equal(payload.downloads[0]?.fileName, "02 - New Song.flac");
    assert.equal(payload.downloads[1]?.fileName, "01 - Track One.flac");
    assert.ok(createManyInput);
    const createData = (createManyInput as AnyRecord).data as AnyRecord[];
    assert.equal(createData.length, 1);
    assert.equal(createData[0]?.releaseFileId, "file-2");
    assert.equal(createData[0]?.orderItemId, "order-item-1");
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

  it("returns refreshed file names after release-file metadata is reconciled", async () => {
    process.env.DATABASE_URL ??=
      "postgresql://postgres:postgres@localhost:5432/merch_table_test";
    const { prisma } = await import("@/lib/prisma");

    restore.push(
      patchMethod(
        prisma.buyerLibraryToken as unknown as AnyRecord,
        "findUnique",
        async () => ({
          id: "lib-token-4",
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
          accessCount: 7,
          expiresAt: null,
        }),
      ),
    );

    let entitlementReadCount = 0;
    restore.push(
      patchMethod(
        prisma.downloadEntitlement as unknown as AnyRecord,
        "findMany",
        async () => {
          entitlementReadCount += 1;
          const fileName =
            entitlementReadCount === 1
              ? "01 - Old Name.flac"
              : "01 - Renamed Track.flac";
          return [
            {
              token: "ent-rename-1",
              createdAt: new Date("2026-04-04T10:00:00.000Z"),
              releaseFileId: "file-1",
              releaseFile: {
                id: "file-1",
                fileName,
                sizeBytes: 111111,
                mimeType: "audio/flac",
              },
              release: {
                id: "release-1",
                title: "Renamed Album",
                slug: "renamed-album",
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
          ];
        },
      ),
    );

    restore.push(
      patchMethod(
        prisma.orderItem as unknown as AnyRecord,
        "findMany",
        async () => [
          {
            id: "order-item-1",
            releaseId: "release-1",
            release: {
              organizationId: "org-1",
            },
          },
        ],
      ),
    );
    restore.push(
      patchMethod(
        prisma.trackAsset as unknown as AnyRecord,
        "findMany",
        async () => [
          {
            trackId: "track-1",
            storageKey: "org/releases/release-1/01-renamed-track.flac",
            mimeType: "audio/flac",
            fileSizeBytes: 111111,
            format: "FLAC",
            track: {
              title: "Renamed Track",
              artistOverride: null,
              trackNumber: 1,
            },
          },
        ],
      ),
    );
    restore.push(
      patchMethod(
        prisma.releaseFile as unknown as AnyRecord,
        "createMany",
        async () => ({ count: 0 }),
      ),
    );
    restore.push(
      patchMethod(
        prisma.releaseFile as unknown as AnyRecord,
        "updateMany",
        async () => ({ count: 1 }),
      ),
    );
    restore.push(
      patchMethod(
        prisma.releaseFile as unknown as AnyRecord,
        "findMany",
        async () => [{ id: "file-1", releaseId: "release-1" }],
      ),
    );

    const { GET } = await import("@/app/api/library/[token]/route");
    const response = await GET(new Request("http://localhost:3000/api/library/lib-token"), {
      params: Promise.resolve({ token: "lib-token" }),
    });

    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      ok: boolean;
      downloads: Array<{ fileName: string }>;
    };
    assert.equal(payload.ok, true);
    assert.equal(payload.downloads.length, 1);
    assert.equal(payload.downloads[0]?.fileName, "01 - Renamed Track.flac");
    assert.equal(entitlementReadCount, 2);
  });
});
