import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { afterEach, describe, it } from "node:test";

import { S3Client } from "@aws-sdk/client-s3";

type AnyRecord = Record<string, unknown>;

function patchMethod(target: AnyRecord, name: string, replacement: unknown) {
  const original = target[name];
  target[name] = replacement;
  return () => {
    target[name] = original;
  };
}

describe("GET /api/download-release/:libraryToken/:releaseId", () => {
  const restore: Array<() => void> = [];

  afterEach(() => {
    while (restore.length > 0) {
      const fn = restore.pop();
      fn?.();
    }
    delete process.env.DATABASE_URL;
  });

  it("returns a ZIP with the expected filename, track entries, and cover art", async () => {
    process.env.DATABASE_URL =
      "postgresql://postgres:postgres@localhost:5432/merch_table_test";
    process.env.STORAGE_MODE = "GARAGE";
    process.env.STORAGE_ENDPOINT = "http://localhost:3900";
    process.env.STORAGE_BUCKET = "media";
    process.env.STORAGE_REGION = "us-east-1";
    process.env.STORAGE_ACCESS_KEY_ID = "access-key-id";
    process.env.STORAGE_SECRET_ACCESS_KEY = "secret-access-key";
    process.env.STORAGE_USE_PATH_STYLE = "true";

    const { prisma } = await import("@/lib/prisma");

    restore.push(
      patchMethod(
        prisma.buyerLibraryToken as unknown as AnyRecord,
        "findUnique",
        async () => ({
          id: "token-1",
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
          id: "token-1",
        }),
      ),
    );
    restore.push(
      patchMethod(
        prisma.downloadEntitlement as unknown as AnyRecord,
        "findFirst",
        async () => ({
          release: {
            organizationId: "org-1",
            title: "Great Release",
            coverImageUrl: "https://example.com/cover.jpg",
            artist: {
              name: "Artist Name",
            },
          },
        }),
      ),
    );
    restore.push(
      patchMethod(
        prisma.trackAsset as unknown as AnyRecord,
        "findMany",
        async () => [
          {
            trackId: "track-1",
            storageKey: "org/releases/release/track-1.flac",
            mimeType: "audio/flac",
            fileSizeBytes: 123,
            format: "FLAC",
            track: {
              title: "First Track",
              artistOverride: null,
              trackNumber: 1,
            },
          },
          {
            trackId: "track-2",
            storageKey: "org/releases/release/track-2.flac",
            mimeType: "audio/flac",
            fileSizeBytes: 456,
            format: "FLAC",
            track: {
              title: "Second Track",
              artistOverride: "Featured Artist",
              trackNumber: 2,
            },
          },
          {
            trackId: "track-3",
            storageKey: "org/releases/release/track-3.mp3",
            mimeType: "audio/mpeg",
            fileSizeBytes: 789,
            format: "MP3",
            track: {
              title: "Bonus Track",
              artistOverride: null,
              trackNumber: 3,
            },
          },
        ],
      ),
    );
    restore.push(
      patchMethod(
        S3Client.prototype as unknown as AnyRecord,
        "send",
        async () => ({
          Body: Readable.from(["audio-bytes"]),
        }),
      ),
    );

    const originalFetch = global.fetch;
    global.fetch = (async () =>
      new Response("cover-art", {
        status: 200,
        headers: {
          "content-type": "image/jpeg",
        },
      })) as typeof fetch;
    restore.push(() => {
      global.fetch = originalFetch;
    });

    const { GET } = await import(
      "@/app/api/download-release/[libraryToken]/[releaseId]/route"
    );

    const response = await GET(
      new Request(
        "http://localhost:3000/api/download-release/token/release-1?format=flac",
      ),
      {
        params: Promise.resolve({
          libraryToken: "token",
          releaseId: "release-1",
        }),
      },
    );

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/zip");
    assert.equal(
      response.headers.get("content-disposition"),
      'attachment; filename="Artist Name - Great Release.zip"',
    );

    const zipBytes = Buffer.from(await response.arrayBuffer()).toString("latin1");
    assert.match(
      zipBytes,
      /Artist Name - Great Release - 01 First Track\.flac/,
    );
    assert.match(
      zipBytes,
      /Artist Name - Great Release - 02 Second Track\.flac/,
    );
    assert.doesNotMatch(zipBytes, /Artist Name - Great Release - 03 Bonus Track\.mp3/);
    assert.doesNotMatch(zipBytes, /01 - First Track\.flac/);
    assert.doesNotMatch(zipBytes, /02 - Second Track\.flac/);
    assert.match(zipBytes, /Artist Name - Great Release - Cover\.jpg/);
  });

  it("returns 403 for a revoked library token", async () => {
    process.env.DATABASE_URL =
      "postgresql://postgres:postgres@localhost:5432/merch_table_test";
    const { prisma } = await import("@/lib/prisma");

    restore.push(
      patchMethod(
        prisma.buyerLibraryToken as unknown as AnyRecord,
        "findUnique",
        async () => ({
          id: "token-2",
          customerId: "customer-2",
          revokedAt: new Date("2026-04-01T00:00:00.000Z"),
          expiresAt: null,
        }),
      ),
    );

    const { GET } = await import(
      "@/app/api/download-release/[libraryToken]/[releaseId]/route"
    );

    const response = await GET(
      new Request(
        "http://localhost:3000/api/download-release/token/release-1?format=flac",
      ),
      {
        params: Promise.resolve({
          libraryToken: "token",
          releaseId: "release-1",
        }),
      },
    );

    assert.equal(response.status, 403);
  });

  it("returns 403 for an expired library token", async () => {
    process.env.DATABASE_URL =
      "postgresql://postgres:postgres@localhost:5432/merch_table_test";
    const { prisma } = await import("@/lib/prisma");

    restore.push(
      patchMethod(
        prisma.buyerLibraryToken as unknown as AnyRecord,
        "findUnique",
        async () => ({
          id: "token-4",
          customerId: "customer-4",
          revokedAt: null,
          expiresAt: new Date("2026-04-01T00:00:00.000Z"),
        }),
      ),
    );

    const { GET } = await import(
      "@/app/api/download-release/[libraryToken]/[releaseId]/route"
    );

    const response = await GET(
      new Request(
        "http://localhost:3000/api/download-release/token/release-1?format=flac",
      ),
      {
        params: Promise.resolve({
          libraryToken: "token",
          releaseId: "release-1",
        }),
      },
    );

    assert.equal(response.status, 403);
  });

  it("returns 400 when format is missing", async () => {
    process.env.DATABASE_URL =
      "postgresql://postgres:postgres@localhost:5432/merch_table_test";

    const { GET } = await import(
      "@/app/api/download-release/[libraryToken]/[releaseId]/route"
    );

    const response = await GET(
      new Request("http://localhost:3000/api/download-release/token/release-1"),
      {
        params: Promise.resolve({
          libraryToken: "token",
          releaseId: "release-1",
        }),
      },
    );

    assert.equal(response.status, 400);
  });

  it("returns available formats when requested format is not present", async () => {
    process.env.DATABASE_URL =
      "postgresql://postgres:postgres@localhost:5432/merch_table_test";
    const { prisma } = await import("@/lib/prisma");

    restore.push(
      patchMethod(
        prisma.buyerLibraryToken as unknown as AnyRecord,
        "findUnique",
        async () => ({
          id: "token-3",
          customerId: "customer-3",
          revokedAt: null,
          expiresAt: null,
        }),
      ),
    );
    restore.push(
      patchMethod(
        prisma.buyerLibraryToken as unknown as AnyRecord,
        "update",
        async () => ({ id: "token-3" }),
      ),
    );
    restore.push(
      patchMethod(
        prisma.downloadEntitlement as unknown as AnyRecord,
        "findFirst",
        async () => ({
          release: {
            organizationId: "org-1",
            title: "Great Release",
            coverImageUrl: null,
            artist: {
              name: "Artist Name",
            },
          },
        }),
      ),
    );
    restore.push(
      patchMethod(
        prisma.trackAsset as unknown as AnyRecord,
        "findMany",
        async () => [
          {
            trackId: "track-1",
            storageKey: "org/releases/release/track-1.mp3",
            mimeType: "audio/mpeg",
            fileSizeBytes: 789,
            format: "MP3",
            track: {
              title: "First Track",
              artistOverride: null,
              trackNumber: 1,
            },
          },
        ],
      ),
    );

    const { GET } = await import(
      "@/app/api/download-release/[libraryToken]/[releaseId]/route"
    );

    const response = await GET(
      new Request(
        "http://localhost:3000/api/download-release/token/release-1?format=flac",
      ),
      {
        params: Promise.resolve({
          libraryToken: "token",
          releaseId: "release-1",
        }),
      },
    );

    assert.equal(response.status, 409);
    const payload = (await response.json()) as {
      ok: boolean;
      availableFormats: string[];
    };
    assert.equal(payload.ok, false);
    assert.deepEqual(payload.availableFormats, ["mp3"]);
  });

  it("continues serving currently available downloads while transcode outputs are still pending", async () => {
    process.env.DATABASE_URL =
      "postgresql://postgres:postgres@localhost:5432/merch_table_test";
    process.env.STORAGE_MODE = "GARAGE";
    process.env.STORAGE_ENDPOINT = "http://localhost:3900";
    process.env.STORAGE_BUCKET = "media";
    process.env.STORAGE_REGION = "us-east-1";
    process.env.STORAGE_ACCESS_KEY_ID = "access-key-id";
    process.env.STORAGE_SECRET_ACCESS_KEY = "secret-access-key";
    process.env.STORAGE_USE_PATH_STYLE = "true";

    const { prisma } = await import("@/lib/prisma");

    restore.push(
      patchMethod(
        prisma.buyerLibraryToken as unknown as AnyRecord,
        "findUnique",
        async () => ({
          id: "token-transcode",
          customerId: "customer-transcode",
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
          id: "token-transcode",
        }),
      ),
    );
    restore.push(
      patchMethod(
        prisma.downloadEntitlement as unknown as AnyRecord,
        "findFirst",
        async () => ({
          release: {
            organizationId: "org-1",
            title: "Backlog Release",
            coverImageUrl: null,
            artist: {
              name: "Artist Name",
            },
          },
        }),
      ),
    );
    restore.push(
      patchMethod(
        prisma.trackAsset as unknown as AnyRecord,
        "findMany",
        async () => [
          {
            trackId: "track-1",
            storageKey: "org/releases/release/track-1.mp3",
            mimeType: "audio/mpeg",
            fileSizeBytes: 789,
            format: "MP3",
            track: {
              title: "First Track",
              artistOverride: null,
              trackNumber: 1,
            },
          },
        ],
      ),
    );
    restore.push(
      patchMethod(
        S3Client.prototype as unknown as AnyRecord,
        "send",
        async () => ({
          Body: Readable.from(["audio-bytes"]),
        }),
      ),
    );

    const { GET } = await import(
      "@/app/api/download-release/[libraryToken]/[releaseId]/route"
    );

    const mp3Response = await GET(
      new Request(
        "http://localhost:3000/api/download-release/token/release-1?format=mp3",
      ),
      {
        params: Promise.resolve({
          libraryToken: "token",
          releaseId: "release-1",
        }),
      },
    );
    assert.equal(mp3Response.status, 200);
    assert.equal(mp3Response.headers.get("content-type"), "application/zip");

    const flacResponse = await GET(
      new Request(
        "http://localhost:3000/api/download-release/token/release-1?format=flac",
      ),
      {
        params: Promise.resolve({
          libraryToken: "token",
          releaseId: "release-1",
        }),
      },
    );

    assert.equal(flacResponse.status, 409);
    const payload = (await flacResponse.json()) as {
      ok: boolean;
      availableFormats: string[];
    };
    assert.equal(payload.ok, false);
    assert.deepEqual(payload.availableFormats, ["mp3"]);
  });
});
