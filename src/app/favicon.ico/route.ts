import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";

import { prisma } from "@/lib/prisma";
import { getStorageAdapterFromEnv } from "@/lib/storage/adapter";
import { extractStorageKeyFromCoverImageUrl } from "@/lib/storage/cover-art";

export const runtime = "nodejs";

type BodyWithWebStream = {
  transformToWebStream?: () => ReadableStream;
};

function resolveOptionalImageUrl(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function createNoStoreRedirect(target: URL) {
  const response = NextResponse.redirect(target, { status: 307 });
  response.headers.set("cache-control", "no-store, max-age=0");
  return response;
}

function resolveFallbackFaviconUrl(requestUrl: URL) {
  const fallback = new URL("/default-favicon.ico", requestUrl);
  const version = requestUrl.searchParams.get("v")?.trim();
  if (version) {
    fallback.searchParams.set("v", version);
  }
  return fallback;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const fallbackUrl = resolveFallbackFaviconUrl(requestUrl);

  try {
    const settings = await prisma.storeSettings.findFirst({
      select: {
        organizationLogoUrl: true,
        updatedAt: true,
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });

    const organizationLogoUrl = resolveOptionalImageUrl(settings?.organizationLogoUrl);
    if (!organizationLogoUrl) {
      return createNoStoreRedirect(fallbackUrl);
    }

    const storageKey = extractStorageKeyFromCoverImageUrl(organizationLogoUrl);
    if (!storageKey) {
      return createNoStoreRedirect(fallbackUrl);
    }

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
      return createNoStoreRedirect(fallbackUrl);
    }

    const response = new NextResponse(webStream, {
      status: 200,
      headers: {
        "content-type": object.ContentType ?? "image/png",
        "cache-control": "no-store, max-age=0, must-revalidate",
      },
    });

    if (settings?.updatedAt) {
      response.headers.set("x-favicon-version", String(settings.updatedAt.getTime()));
    }

    return response;
  } catch {
    return createNoStoreRedirect(fallbackUrl);
  }
}
