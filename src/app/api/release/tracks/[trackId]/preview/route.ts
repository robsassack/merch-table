import { Readable } from "node:stream";

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";

import { resolveStorefrontPreviewAsset } from "@/lib/audio/preview-source";
import { prisma } from "@/lib/prisma";
import { getStorageAdapterFromEnv } from "@/lib/storage/adapter";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ trackId: string }>;
};

type BodyWithWebStream = {
  transformToWebStream?: () => ReadableStream;
};

function toWebReadableStream(body: unknown): ReadableStream | null {
  if (body && typeof body === "object") {
    const maybeWebStreamBody = body as BodyWithWebStream;
    if (typeof maybeWebStreamBody.transformToWebStream === "function") {
      return maybeWebStreamBody.transformToWebStream();
    }

    const maybeNodeReadable = body as { pipe?: unknown };
    if (typeof maybeNodeReadable.pipe === "function") {
      return Readable.toWeb(body as Readable) as ReadableStream;
    }
  }

  return null;
}

export async function GET(request: Request, context: RouteContext) {
  const { trackId } = await context.params;
  if (!trackId) {
    return NextResponse.json(
      { ok: false, error: "Track id is required." },
      { status: 400 },
    );
  }

  const settings = await prisma.storeSettings.findFirst({
    select: { organizationId: true },
    orderBy: { createdAt: "asc" },
  });

  if (!settings?.organizationId) {
    return NextResponse.json(
      { ok: false, error: "Track not found." },
      { status: 404 },
    );
  }

  const track = await prisma.releaseTrack.findFirst({
    where: {
      id: trackId,
      release: {
        organizationId: settings.organizationId,
        status: "PUBLISHED",
        deletedAt: null,
        publishedAt: { not: null },
        artist: {
          deletedAt: null,
        },
      },
    },
    select: {
      previewMode: true,
      assets: {
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          assetRole: true,
          format: true,
          isLossless: true,
          updatedAt: true,
          storageKey: true,
          mimeType: true,
        },
      },
    },
  });

  if (!track) {
    return NextResponse.json(
      { ok: false, error: "Track not found." },
      { status: 404 },
    );
  }

  const sourceAsset = resolveStorefrontPreviewAsset({
    previewMode: track.previewMode,
    assets: track.assets,
  });

  if (!sourceAsset) {
    return NextResponse.json(
      { ok: false, error: "Preview audio is not available yet." },
      { status: 404 },
    );
  }

  try {
    const storage = getStorageAdapterFromEnv();
    const range = request.headers.get("range") ?? undefined;
    const object = await storage.getClient().send(
      new GetObjectCommand({
        Bucket: storage.bucket,
        Key: sourceAsset.storageKey,
        Range: range,
      }),
    );

    const webStream = toWebReadableStream(object.Body);
    if (!webStream) {
      return NextResponse.json(
        { ok: false, error: "Track preview is empty." },
        { status: 404 },
      );
    }

    const status =
      object.$metadata.httpStatusCode && object.$metadata.httpStatusCode >= 200
        ? object.$metadata.httpStatusCode
        : range
          ? 206
          : 200;

    const headers: Record<string, string> = {
      "content-type": object.ContentType ?? sourceAsset.mimeType ?? "application/octet-stream",
      "cache-control": "public, max-age=60",
      "accept-ranges": "bytes",
    };

    if (typeof object.ContentLength === "number" && Number.isFinite(object.ContentLength)) {
      headers["content-length"] = String(object.ContentLength);
    }

    if (object.ContentRange) {
      headers["content-range"] = object.ContentRange;
    }

    if (object.ETag) {
      headers.etag = object.ETag;
    }

    return new NextResponse(webStream, {
      status,
      headers,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not stream track preview." },
      { status: 404 },
    );
  }
}
