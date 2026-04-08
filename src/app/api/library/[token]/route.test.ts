import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { OWNED_RELEASE_HINT_COOKIE_NAME } from "@/lib/checkout/owned-release-hint-cookie";

type AnyRecord = Record<string, unknown>;

const TEST_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/merch_table_test";
const ROUTE_URL = "http://localhost:3000/api/library/lib-token";

function patchMethod(target: AnyRecord, name: string, replacement: unknown) {
  const original = target[name];
  target[name] = replacement;
  return () => {
    target[name] = original;
  };
}

function useTestDatabase() {
  process.env.DATABASE_URL ??= TEST_DATABASE_URL;
}

function makeBuyerLibraryToken(overrides?: {
  id?: string;
  customerId?: string;
  revokedAt?: Date | null;
  expiresAt?: Date | null;
}) {
  return {
    id: overrides?.id ?? "lib-token-1",
    customerId: overrides?.customerId ?? "customer-1",
    revokedAt: overrides?.revokedAt ?? null,
    expiresAt: overrides?.expiresAt ?? null,
  };
}

function makeBuyerLibraryTokenUpdate(overrides?: {
  lastUsedAt?: Date;
  accessCount?: number;
  expiresAt?: Date | null;
}) {
  return {
    lastUsedAt: overrides?.lastUsedAt ?? new Date("2026-04-04T12:00:00.000Z"),
    accessCount: overrides?.accessCount ?? 1,
    expiresAt: overrides?.expiresAt ?? null,
  };
}

function makeEntitlement(overrides?: {
  token?: string;
  createdAt?: Date;
  releaseFileId?: string;
  fileName?: string;
  sizeBytes?: number;
  mimeType?: string;
  releaseId?: string;
  releaseTitle?: string;
  releaseSlug?: string;
  coverImageUrl?: string | null;
  artistName?: string;
  orderId?: string;
  orderNumber?: string;
  paidAt?: Date;
  orderCreatedAt?: Date;
}) {
  return {
    token: overrides?.token ?? "ent-1",
    createdAt: overrides?.createdAt ?? new Date("2026-04-04T10:00:00.000Z"),
    releaseFileId: overrides?.releaseFileId ?? "file-1",
    releaseFile: {
      id: overrides?.releaseFileId ?? "file-1",
      fileName: overrides?.fileName ?? "01 - Track One.flac",
      sizeBytes: overrides?.sizeBytes ?? 123456,
      mimeType: overrides?.mimeType ?? "audio/flac",
    },
    release: {
      id: overrides?.releaseId ?? "release-1",
      title: overrides?.releaseTitle ?? "Release One",
      slug: overrides?.releaseSlug ?? "release-one",
      coverImageUrl: overrides?.coverImageUrl ?? null,
      artist: {
        name: overrides?.artistName ?? "Artist One",
      },
    },
    orderItem: {
      order: {
        id: overrides?.orderId ?? "order-1",
        orderNumber: overrides?.orderNumber ?? "ORDER-1",
        paidAt: overrides?.paidAt ?? new Date("2026-04-03T12:00:00.000Z"),
        createdAt:
          overrides?.orderCreatedAt ?? new Date("2026-04-03T12:00:00.000Z"),
      },
    },
  };
}

async function loadLibrary(token = "lib-token") {
  const { GET } = await import("@/app/api/library/[token]/route");
  return GET(new Request(ROUTE_URL), {
    params: Promise.resolve({ token }),
  });
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
    useTestDatabase();
    const { prisma } = await import("@/lib/prisma");

    restore.push(
      patchMethod(
        prisma.buyerLibraryToken as unknown as AnyRecord,
        "findUnique",
        async () => makeBuyerLibraryToken({ id: "lib-token-1" }),
      ),
    );

    let buyerLibraryTokenUpdateInput: AnyRecord | null = null;
    restore.push(
      patchMethod(
        prisma.buyerLibraryToken as unknown as AnyRecord,
        "update",
        async (input: AnyRecord) => {
          buyerLibraryTokenUpdateInput = input;
          return makeBuyerLibraryTokenUpdate({ accessCount: 3 });
        },
      ),
    );

    restore.push(
      patchMethod(
        prisma.downloadEntitlement as unknown as AnyRecord,
        "findMany",
        async () => [makeEntitlement()],
      ),
    );
    restore.push(
      patchMethod(prisma.orderItem as unknown as AnyRecord, "findMany", async () => []),
    );

    const response = await loadLibrary();

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

  it("deduplicates repeat entitlements for the same release file", async () => {
    useTestDatabase();
    const { prisma } = await import("@/lib/prisma");

    restore.push(
      patchMethod(
        prisma.buyerLibraryToken as unknown as AnyRecord,
        "findUnique",
        async () => makeBuyerLibraryToken({ id: "lib-token-dupe" }),
      ),
    );
    restore.push(
      patchMethod(
        prisma.buyerLibraryToken as unknown as AnyRecord,
        "update",
        async () => makeBuyerLibraryTokenUpdate({ accessCount: 10 }),
      ),
    );

    restore.push(
      patchMethod(
        prisma.downloadEntitlement as unknown as AnyRecord,
        "findMany",
        async () => [
          makeEntitlement({
            token: "ent-new",
            createdAt: new Date("2026-04-04T11:00:00.000Z"),
            orderId: "order-2",
            orderNumber: "ORDER-2",
            paidAt: new Date("2026-04-04T10:00:00.000Z"),
            orderCreatedAt: new Date("2026-04-04T10:00:00.000Z"),
          }),
          makeEntitlement({
            token: "ent-old",
            createdAt: new Date("2026-04-03T11:00:00.000Z"),
            paidAt: new Date("2026-04-03T10:00:00.000Z"),
            orderCreatedAt: new Date("2026-04-03T10:00:00.000Z"),
          }),
        ],
      ),
    );
    restore.push(
      patchMethod(prisma.orderItem as unknown as AnyRecord, "findMany", async () => []),
    );

    const response = await loadLibrary();

    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      ok: boolean;
      downloads: Array<{ downloadPath: string }>;
      availableDownloadFormatsByReleaseId: Record<string, string[]>;
    };

    assert.equal(payload.ok, true);
    assert.equal(payload.downloads.length, 1);
    assert.equal(payload.downloads[0]?.downloadPath, "/api/download/ent-new/file-1");
    assert.deepEqual(payload.availableDownloadFormatsByReleaseId["release-1"], [
      "flac",
    ]);
  });

  it("adds missing entitlements for newly added release files before returning library downloads", async () => {
    useTestDatabase();
    const { prisma } = await import("@/lib/prisma");

    restore.push(
      patchMethod(
        prisma.buyerLibraryToken as unknown as AnyRecord,
        "findUnique",
        async () => makeBuyerLibraryToken({ id: "lib-token-3" }),
      ),
    );
    restore.push(
      patchMethod(
        prisma.buyerLibraryToken as unknown as AnyRecord,
        "update",
        async () => makeBuyerLibraryTokenUpdate({ accessCount: 4 }),
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
            return [makeEntitlement({ token: "ent-1", releaseFileId: "file-1" })];
          }

          return [
            makeEntitlement({
              token: "ent-2",
              createdAt: new Date("2026-04-04T11:00:00.000Z"),
              releaseFileId: "file-2",
              fileName: "02 - New Song.flac",
              sizeBytes: 654321,
            }),
            makeEntitlement({ token: "ent-1", releaseFileId: "file-1" }),
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

    const response = await loadLibrary();

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
    useTestDatabase();
    const { prisma } = await import("@/lib/prisma");

    restore.push(
      patchMethod(
        prisma.buyerLibraryToken as unknown as AnyRecord,
        "findUnique",
        async () =>
          makeBuyerLibraryToken({
            id: "lib-token-2",
            expiresAt: new Date("2026-04-04T00:00:00.000Z"),
          }),
      ),
    );

    const response = await loadLibrary();

    assert.equal(response.status, 403);
  });

  it("returns refreshed file names after release-file metadata is reconciled", async () => {
    useTestDatabase();
    const { prisma } = await import("@/lib/prisma");

    restore.push(
      patchMethod(
        prisma.buyerLibraryToken as unknown as AnyRecord,
        "findUnique",
        async () => makeBuyerLibraryToken({ id: "lib-token-4" }),
      ),
    );
    restore.push(
      patchMethod(
        prisma.buyerLibraryToken as unknown as AnyRecord,
        "update",
        async () => makeBuyerLibraryTokenUpdate({ accessCount: 7 }),
      ),
    );

    let entitlementReadCount = 0;
    restore.push(
      patchMethod(
        prisma.downloadEntitlement as unknown as AnyRecord,
        "findMany",
        async () => {
          entitlementReadCount += 1;
          return [
            makeEntitlement({
              token: "ent-rename-1",
              releaseTitle: "Renamed Album",
              releaseSlug: "renamed-album",
              fileName:
                entitlementReadCount === 1
                  ? "01 - Old Name.flac"
                  : "01 - Renamed Track.flac",
              sizeBytes: 111111,
            }),
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
        "deleteMany",
        async () => ({ count: 0 }),
      ),
    );
    restore.push(
      patchMethod(
        prisma.releaseFile as unknown as AnyRecord,
        "findMany",
        async () => [{ id: "file-1", releaseId: "release-1" }],
      ),
    );

    const response = await loadLibrary();

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
