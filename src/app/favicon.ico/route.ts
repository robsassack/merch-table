import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

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

    const logoProxyUrl = new URL("/api/cover", requestUrl);
    logoProxyUrl.searchParams.set("url", organizationLogoUrl);
    if (settings?.updatedAt) {
      logoProxyUrl.searchParams.set("v", String(settings.updatedAt.getTime()));
    }

    return createNoStoreRedirect(logoProxyUrl);
  } catch {
    return createNoStoreRedirect(fallbackUrl);
  }
}
