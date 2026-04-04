import { GetObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";

import { getStorageAdapterFromEnv } from "@/lib/storage/adapter";
import { extractStorageKeyFromCoverImageUrl } from "@/lib/storage/cover-art";

export const runtime = "nodejs";

type BodyWithWebStream = {
  transformToWebStream?: () => ReadableStream;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
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

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        "content-type": object.ContentType ?? "application/octet-stream",
        "cache-control": "public, max-age=300, stale-while-revalidate=300",
      },
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not load cover image." },
      { status: 404 },
    );
  }
}
