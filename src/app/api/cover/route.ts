import { GetObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";

import { getStorageAdapterFromEnv } from "@/lib/storage/adapter";
import { extractStorageKeyFromCoverImageUrl } from "@/lib/storage/cover-art";

export const runtime = "nodejs";

type BodyWithWebStream = {
  transformToWebStream?: () => ReadableStream;
};

function resolveRequestVersion(requestUrl: URL) {
  const version = requestUrl.searchParams.get("v")?.trim();
  return version && version.length > 0 ? version : null;
}

function resolveCacheControlHeader(requestUrl: URL) {
  return resolveRequestVersion(requestUrl)
    ? "public, max-age=31536000, immutable"
    : "public, max-age=300, stale-while-revalidate=300";
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const { searchParams } = requestUrl;
  const cacheControl = resolveCacheControlHeader(requestUrl);
  const rawUrl = searchParams.get("url")?.trim();
  if (!rawUrl) {
    return NextResponse.json(
      { ok: false, error: "Cover URL is required." },
      { status: 400 },
    );
  }

  const storageKey = extractStorageKeyFromCoverImageUrl(rawUrl);
  if (!storageKey) {
    return NextResponse.json(
      { ok: false, error: "Invalid or unsupported cover URL." },
      { status: 400 },
    );
  }

  try {
    const storage = getStorageAdapterFromEnv();
    const object = await storage.getClient().send(
      new GetObjectCommand({
        Bucket: storage.bucket,
        Key: storageKey,
      }),
    );

    const body = object.Body as BodyWithWebStream | undefined;
    const webStream = body?.transformToWebStream?.();
    if (!webStream) {
      return NextResponse.json(
        { ok: false, error: "Cover object is empty." },
        { status: 404 },
      );
    }

    const ifNoneMatch = request.headers.get("if-none-match");
    if (object.ETag && ifNoneMatch?.split(",").some((token) => token.trim() === object.ETag)) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          "cache-control": cacheControl,
          etag: object.ETag,
        },
      });
    }

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        "content-type": object.ContentType ?? "application/octet-stream",
        "cache-control": cacheControl,
        ...(object.ETag ? { etag: object.ETag } : {}),
      },
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not load cover image." },
      { status: 404 },
    );
  }
}
