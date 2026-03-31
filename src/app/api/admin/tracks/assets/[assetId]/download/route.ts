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

function resolveDownloadFileName(storageKey: string) {
  const trimmed = storageKey.trim();
  if (trimmed.length === 0) {
    return "track-asset.bin";
  }

  const lastSegment = trimmed.split("/").pop() ?? trimmed;
  const decoded = (() => {
    try {
      return decodeURIComponent(lastSegment);
    } catch {
      return lastSegment;
    }
  })();

  const withoutUuidPrefix = decoded.replace(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-/i,
    "",
  );
  const candidate = withoutUuidPrefix.length > 0 ? withoutUuidPrefix : decoded;

  return candidate.replace(/["\\]/g, "_");
}

export async function GET(_request: Request, context: RouteContext) {
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
    const object = await storage.getClient().send(
      new GetObjectCommand({
        Bucket: storage.bucket,
        Key: asset.storageKey,
      }),
    );

    const body = object.Body as BodyWithWebStream | undefined;
    const webStream = body?.transformToWebStream?.();
    if (!webStream) {
      return NextResponse.json(
        { ok: false, error: "Track asset is empty." },
        { status: 404 },
      );
    }

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        "content-type": object.ContentType ?? asset.mimeType ?? "application/octet-stream",
        "content-disposition": `attachment; filename="${resolveDownloadFileName(asset.storageKey)}"`,
        "cache-control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not download track asset." },
      { status: 404 },
    );
  }
}
