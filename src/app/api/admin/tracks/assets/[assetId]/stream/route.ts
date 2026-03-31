import { Readable } from "node:stream";

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";

import { requireAdminRequestContext } from "@/lib/admin/request-context";
import { prisma } from "@/lib/prisma";
import { getStorageAdapterFromEnv } from "@/lib/storage/adapter";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ assetId: string }>;
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
  const auth = await requireAdminRequestContext();
  if (!auth.ok) {
    return auth.response;
  }

  const { assetId } = await context.params;
  if (!assetId) {
    return NextResponse.json(
      { ok: false, error: "Asset id is required." },
      { status: 400 },
    );
  }

  const asset = await prisma.trackAsset.findFirst({
    where: {
      id: assetId,
      track: {
        release: {
          organizationId: auth.context.organizationId,
        },
      },
    },
    select: {
      id: true,
      storageKey: true,
      mimeType: true,
    },
  });

  if (!asset) {
    return NextResponse.json(
      { ok: false, error: "Track asset not found." },
      { status: 404 },
    );
  }

  try {
    const storage = getStorageAdapterFromEnv();
    const range = request.headers.get("range") ?? undefined;
    const object = await storage.getClient().send(
      new GetObjectCommand({
        Bucket: storage.bucket,
        Key: asset.storageKey,
        Range: range,
      }),
    );

    const webStream = toWebReadableStream(object.Body);
    if (!webStream) {
      return NextResponse.json(
        { ok: false, error: "Track asset is empty." },
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
      "content-type": object.ContentType ?? asset.mimeType ?? "application/octet-stream",
      "cache-control": "private, no-store",
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
      { ok: false, error: "Could not stream track asset." },
      { status: 404 },
    );
  }
}
