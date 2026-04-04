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

describe("GET /api/download/:entitlementToken/:releaseFileId", () => {
  const restore: Array<() => void> = [];

  afterEach(() => {
    while (restore.length > 0) {
      const fn = restore.pop();
      fn?.();
    }
  });

  it("redirects to a signed URL for a valid entitlement", async () => {
    process.env.DATABASE_URL ??=
      "postgresql://postgres:postgres@localhost:5432/merch_table_test";
    const { prisma } = await import("@/lib/prisma");
    process.env.STORAGE_MODE = "GARAGE";
    process.env.STORAGE_ENDPOINT = "http://localhost:3900";
    process.env.STORAGE_BUCKET = "media";
    process.env.STORAGE_REGION = "us-east-1";
    process.env.STORAGE_ACCESS_KEY_ID = "access-key-id";
    process.env.STORAGE_SECRET_ACCESS_KEY = "secret-access-key";
    process.env.STORAGE_USE_PATH_STYLE = "true";

    restore.push(
      patchMethod(
        prisma.downloadEntitlement as unknown as AnyRecord,
        "findUnique",
        async () => ({
          releaseFileId: "file-1",
          expiresAt: null,
          releaseFile: {
            id: "file-1",
            storageKey: "org-1/releases/release-1/01-track-one.flac",
            mimeType: "audio/flac",
            fileName: "01 - Track One.flac",
          },
          release: {
            artist: {
              name: "Artist One",
            },
          },
        }),
      ),
    );

    const { GET } = await import(
      "@/app/api/download/[entitlementToken]/[releaseFileId]/route"
    );

    const response = await GET(
      new Request("http://localhost:3000/api/download/ent-1/file-1"),
      {
        params: Promise.resolve({
          entitlementToken: "ent-1",
          releaseFileId: "file-1",
        }),
      },
    );

    assert.equal(response.status, 302);
    assert.equal(
      response.headers.get("cache-control"),
      "no-store, no-cache, must-revalidate, proxy-revalidate",
    );

    const location = response.headers.get("location");
    assert.ok(location);
    assert.match(location, /X-Amz-Signature=/);
    assert.match(location, /response-content-disposition=/);
  });

  it("generates a fresh signed URL on each request", async () => {
    process.env.DATABASE_URL ??=
      "postgresql://postgres:postgres@localhost:5432/merch_table_test";
    const { prisma } = await import("@/lib/prisma");
    process.env.STORAGE_MODE = "GARAGE";
    process.env.STORAGE_ENDPOINT = "http://localhost:3900";
    process.env.STORAGE_BUCKET = "media";
    process.env.STORAGE_REGION = "us-east-1";
    process.env.STORAGE_ACCESS_KEY_ID = "access-key-id";
    process.env.STORAGE_SECRET_ACCESS_KEY = "secret-access-key";
    process.env.STORAGE_USE_PATH_STYLE = "true";

    restore.push(
      patchMethod(
        prisma.downloadEntitlement as unknown as AnyRecord,
        "findUnique",
        async () => ({
          releaseFileId: "file-1",
          expiresAt: null,
          releaseFile: {
            id: "file-1",
            storageKey: "org-1/releases/release-1/01-track-one.flac",
            mimeType: "audio/flac",
            fileName: "01 - Track One.flac",
          },
          release: {
            artist: {
              name: "Artist One",
            },
          },
        }),
      ),
    );

    const { GET } = await import(
      "@/app/api/download/[entitlementToken]/[releaseFileId]/route"
    );

    const firstResponse = await GET(
      new Request("http://localhost:3000/api/download/ent-1/file-1"),
      {
        params: Promise.resolve({
          entitlementToken: "ent-1",
          releaseFileId: "file-1",
        }),
      },
    );
    const firstLocation = firstResponse.headers.get("location");
    assert.ok(firstLocation);

    await new Promise((resolve) => setTimeout(resolve, 1_100));

    const secondResponse = await GET(
      new Request("http://localhost:3000/api/download/ent-1/file-1"),
      {
        params: Promise.resolve({
          entitlementToken: "ent-1",
          releaseFileId: "file-1",
        }),
      },
    );
    const secondLocation = secondResponse.headers.get("location");
    assert.ok(secondLocation);

    assert.notEqual(firstLocation, secondLocation);

    const firstSignedAt = new URL(firstLocation).searchParams.get("X-Amz-Date");
    const secondSignedAt = new URL(secondLocation).searchParams.get("X-Amz-Date");
    assert.ok(firstSignedAt);
    assert.ok(secondSignedAt);
    assert.notEqual(firstSignedAt, secondSignedAt);
  });

  it("returns 403 when entitlement has expired", async () => {
    process.env.DATABASE_URL ??=
      "postgresql://postgres:postgres@localhost:5432/merch_table_test";
    const { prisma } = await import("@/lib/prisma");

    restore.push(
      patchMethod(
        prisma.downloadEntitlement as unknown as AnyRecord,
        "findUnique",
        async () => ({
          releaseFileId: "file-1",
          expiresAt: new Date("2026-04-01T00:00:00.000Z"),
          releaseFile: {
            id: "file-1",
            storageKey: "org-1/releases/release-1/01-track-one.flac",
            mimeType: "audio/flac",
            fileName: "01 - Track One.flac",
          },
          release: {
            artist: {
              name: "Artist One",
            },
          },
        }),
      ),
    );

    const { GET } = await import(
      "@/app/api/download/[entitlementToken]/[releaseFileId]/route"
    );

    const response = await GET(
      new Request("http://localhost:3000/api/download/ent-1/file-1"),
      {
        params: Promise.resolve({
          entitlementToken: "ent-1",
          releaseFileId: "file-1",
        }),
      },
    );

    assert.equal(response.status, 403);
  });
});
