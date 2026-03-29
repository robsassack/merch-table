import { NextResponse } from "next/server";
import { z } from "zod";

import { MembershipRole } from "@/generated/prisma/enums";
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

async function isAuthorizedAdminEmail(email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      organizations: { select: { id: true }, take: 1 },
      memberships: {
        where: { role: { in: [MembershipRole.OWNER, MembershipRole.ADMIN] } },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!user) {
    return false;
  }

  return user.organizations.length > 0 || user.memberships.length > 0;
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
    select: { setupComplete: true },
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

    const authorized = await isAuthorizedAdminEmail(normalizedEmail);
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
