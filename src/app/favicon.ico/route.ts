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

function resolveRequestVersion(requestUrl: URL) {
  const version = requestUrl.searchParams.get("v")?.trim();
  return version && version.length > 0 ? version : null;
}

function resolveCacheControlHeader(requestUrl: URL) {
  return resolveRequestVersion(requestUrl)
    ? "public, max-age=31536000, immutable"
    : "public, max-age=300, stale-while-revalidate=86400";
}

function createCachedRedirect(target: URL, requestUrl: URL) {
  const response = NextResponse.redirect(target, { status: 307 });
  response.headers.set("cache-control", resolveCacheControlHeader(requestUrl));
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
  const cacheControl = resolveCacheControlHeader(requestUrl);

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
      return createCachedRedirect(fallbackUrl, requestUrl);
    }

    const storageKey = extractStorageKeyFromCoverImageUrl(organizationLogoUrl);
    if (!storageKey) {
      return createCachedRedirect(fallbackUrl, requestUrl);
    }

    const faviconVersion = settings?.updatedAt?.getTime() ?? 0;
    const faviconEtag = `W/"favicon-${faviconVersion}-${encodeURIComponent(storageKey)}"`;
    const ifNoneMatch = request.headers.get("if-none-match");
    if (ifNoneMatch?.split(",").some((token) => token.trim() === faviconEtag)) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          "cache-control": cacheControl,
          etag: faviconEtag,
        },
      });
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
      return createCachedRedirect(fallbackUrl, requestUrl);
    }

    const response = new NextResponse(webStream, {
      status: 200,
      headers: {
        "content-type": object.ContentType ?? "image/png",
        "cache-control": cacheControl,
        etag: faviconEtag,
      },
    });

    if (settings?.updatedAt) {
      response.headers.set("x-favicon-version", String(settings.updatedAt.getTime()));
    }

    return response;
  } catch {
    return createCachedRedirect(fallbackUrl, requestUrl);
  }
}
