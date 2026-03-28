import { NextResponse } from "next/server";

type CsrfOptions = {
  protectGet?: boolean;
};

function getAllowedOrigins(request: Request) {
  const allowed = new Set<string>();

  try {
    allowed.add(new URL(request.url).origin);
  } catch {
    // Ignore malformed request URL.
  }

  const appBaseUrl = process.env.APP_BASE_URL?.trim();
  if (appBaseUrl) {
    try {
      allowed.add(new URL(appBaseUrl).origin);
    } catch {
      // Ignore malformed APP_BASE_URL values.
    }
  }

  return allowed;
}

function isStateChangingMethod(method: string) {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

export function enforceCsrfProtection(
  request: Request,
  options: CsrfOptions = {},
) {
  const method = request.method.toUpperCase();
  if (!isStateChangingMethod(method) && !options.protectGet) {
    return null;
  }

  const secFetchSite = request.headers.get("sec-fetch-site");
  if (
    secFetchSite &&
    !["same-origin", "same-site", "none"].includes(secFetchSite)
  ) {
    return NextResponse.json(
      { error: "Cross-site requests are not allowed." },
      { status: 403 },
    );
  }

  const origin = request.headers.get("origin");
  if (!origin) {
    return null;
  }

  const allowedOrigins = getAllowedOrigins(request);
  if (allowedOrigins.has(origin)) {
    return null;
  }

  return NextResponse.json(
    { error: "Invalid request origin." },
    { status: 403 },
  );
}
