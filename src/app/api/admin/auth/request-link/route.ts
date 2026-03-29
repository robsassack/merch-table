import { NextResponse } from "next/server";
import { z } from "zod";

import { MembershipRole } from "@/generated/prisma/enums";
import { sendAdminMagicLink } from "@/lib/auth/admin-magic-link";
import { enforceCsrfProtection } from "@/lib/security/csrf";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { prisma } from "@/lib/prisma";

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

  const rateLimitError = enforceRateLimit(request, {
    id: "admin-auth-request-link",
    maxRequests: 10,
    windowMs: 15 * 60 * 1_000,
  });
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

    const authorized = await isAuthorizedAdminEmail(normalizedEmail);
    if (authorized) {
      try {
        await sendAdminMagicLink(normalizedEmail);
      } catch {
        return NextResponse.json(
          { ok: false, error: "Could not send sign-in link." },
          { status: 400 },
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
