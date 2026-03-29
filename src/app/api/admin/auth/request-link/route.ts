import { NextResponse } from "next/server";
import { z } from "zod";

import { adminEmailHasAccessToOrganization } from "@/lib/auth/admin-access";
import { sendAdminMagicLink } from "@/lib/auth/admin-magic-link";
import { prisma } from "@/lib/prisma";
import { authRateLimitPolicies } from "@/lib/security/auth-policies";
import { enforceCsrfProtection } from "@/lib/security/csrf";
import {
  consumeRateLimit,
  createHashedRateLimitKey,
  enforceRateLimit,
} from "@/lib/security/rate-limit";

export const runtime = "nodejs";

const requestSchema = z.object({
  email: z.email().max(320),
});

const GENERIC_SUCCESS_MESSAGE =
  "If that email is authorized, a magic link has been sent.";

async function isAuthorizedAdminEmail(email: string, organizationId: string) {
  return adminEmailHasAccessToOrganization({ email, organizationId });
}

export async function POST(request: Request) {
  const csrfError = enforceCsrfProtection(request);
  if (csrfError) {
    return csrfError;
  }

  const rateLimitError = await enforceRateLimit(
    request,
    authRateLimitPolicies.requestLinkByIp,
  );
  if (rateLimitError) {
    return rateLimitError;
  }

  const setup = await prisma.storeSettings.findFirst({
    select: { setupComplete: true, organizationId: true },
    orderBy: { createdAt: "asc" },
  });
  if (!setup?.setupComplete) {
    return NextResponse.json(
      { error: "Setup must be complete before admin sign-in." },
      { status: 409 },
    );
  }

  try {
    const payload = await request.json();
    const parsed = requestSchema.parse(payload);
    const normalizedEmail = parsed.email.trim().toLowerCase();

    const emailScopedRateLimit = await consumeRateLimit(
      request,
      authRateLimitPolicies.requestLinkByEmail,
      {
        key: `admin-email:${createHashedRateLimitKey(normalizedEmail)}`,
      },
    );
    if (emailScopedRateLimit.limited) {
      return NextResponse.json({ ok: true, message: GENERIC_SUCCESS_MESSAGE });
    }

    const authorized = await isAuthorizedAdminEmail(
      normalizedEmail,
      setup.organizationId,
    );
    if (authorized) {
      try {
        await sendAdminMagicLink(normalizedEmail);
      } catch (error) {
        console.warn(
          `[auth] Failed to send admin magic link: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        );
      }
    }

    return NextResponse.json({ ok: true, message: GENERIC_SUCCESS_MESSAGE });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: "Enter a valid email address." },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { ok: false, error: "Could not process sign-in request." },
      { status: 500 },
    );
  }
}
