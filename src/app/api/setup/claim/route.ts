import { NextResponse } from "next/server";

import {
  createSetupSessionCookieValue,
  getSetupSessionCookieName,
  getSetupSessionTtlSeconds,
} from "@/lib/auth/setup-session";
import { claimBootstrapSetupToken } from "@/lib/bootstrap/setup-token";
import { enforceCsrfProtection } from "@/lib/security/csrf";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { setupRateLimitPolicies } from "@/lib/security/setup-policies";

function buildSetupClaimResponse(claimed: boolean) {
  if (!claimed) {
    return NextResponse.json(
      { ok: false, error: "Invalid or expired setup token." },
      { status: 401 },
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: getSetupSessionCookieName(),
    value: createSetupSessionCookieValue(),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: getSetupSessionTtlSeconds(),
  });

  return response;
}

async function claimFromToken(token: string | null | undefined) {
  const normalizedToken = token?.trim();
  if (!normalizedToken) {
    return NextResponse.json(
      { ok: false, error: "Missing setup token." },
      { status: 400 },
    );
  }

  const claimed = await claimBootstrapSetupToken(normalizedToken);
  return buildSetupClaimResponse(claimed);
}

export async function GET(request: Request) {
  const csrfError = enforceCsrfProtection(request, { protectGet: true });
  if (csrfError) {
    return csrfError;
  }

  const rateLimitError = await enforceRateLimit(
    request,
    setupRateLimitPolicies.claimToken,
  );
  if (rateLimitError) {
    return rateLimitError;
  }

  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  return claimFromToken(token);
}

export async function POST(request: Request) {
  const csrfError = enforceCsrfProtection(request);
  if (csrfError) {
    return csrfError;
  }

  const rateLimitError = await enforceRateLimit(
    request,
    setupRateLimitPolicies.claimToken,
  );
  if (rateLimitError) {
    return rateLimitError;
  }

  const payload = (await request.json().catch(() => null)) as
    | { token?: string }
    | null;
  return claimFromToken(payload?.token);
}
