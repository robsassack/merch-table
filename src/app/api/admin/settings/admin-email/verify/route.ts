import { NextResponse } from "next/server";

import { requireAdminRequestContext } from "@/lib/admin/request-context";
import { auth } from "@/lib/better-auth";
import { authRateLimitPolicies } from "@/lib/security/auth-policies";
import { enforceCsrfProtection } from "@/lib/security/csrf";
import {
  consumeRateLimit,
  createHashedRateLimitKey,
  enforceRateLimit,
} from "@/lib/security/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const csrfError = enforceCsrfProtection(request);
  if (csrfError) {
    return csrfError;
  }

  const authContext = await requireAdminRequestContext();
  if (!authContext.ok) {
    return authContext.response;
  }

  const ipRateLimitError = await enforceRateLimit(
    request,
    authRateLimitPolicies.requestLinkByIp,
  );
  if (ipRateLimitError) {
    return ipRateLimitError;
  }

  const normalizedEmail = authContext.context.session.email.trim().toLowerCase();
  const emailRateLimit = await consumeRateLimit(
    request,
    authRateLimitPolicies.requestLinkByEmail,
    {
      key: `admin-email:${createHashedRateLimitKey(normalizedEmail)}`,
    },
  );

  if (!emailRateLimit.limited) {
    try {
      await auth.api.signInMagicLink({
        body: {
          email: normalizedEmail,
        },
        headers: request.headers,
      });
    } catch (error) {
      console.warn(
        `[auth] Failed to send admin email verification link: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }
  }

  return NextResponse.json({
    ok: true,
    message: "If allowed, a verification link has been sent to your current admin email.",
  });
}
