import { NextResponse } from "next/server";
import { z } from "zod";

import { MembershipRole } from "@/generated/prisma/enums";
import { consumeAdminMagicLinkToken } from "@/lib/auth/admin-magic-link";
import {
  createAdminSessionCookieValue,
  getAdminSessionCookieName,
  getAdminSessionTtlSeconds,
} from "@/lib/auth/admin-session";
import { getSetupSessionCookieName } from "@/lib/auth/setup-session";
import { prisma } from "@/lib/prisma";
import { enforceCsrfProtection } from "@/lib/security/csrf";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { getStepOneState, isStepOneComplete } from "@/lib/setup/step-one";
import { completeSetup } from "@/lib/setup/step-six";

export const runtime = "nodejs";

const consumeSchema = z.object({
  token: z.string().trim().min(1),
});

export async function POST(request: Request) {
  const csrfError = enforceCsrfProtection(request);
  if (csrfError) {
    return csrfError;
  }

  const rateLimitError = enforceRateLimit(request, {
    id: "admin-auth-consume-link",
    maxRequests: 30,
    windowMs: 15 * 60 * 1_000,
  });
  if (rateLimitError) {
    return rateLimitError;
  }

  try {
    const payload = await request.json();
    const parsed = consumeSchema.parse(payload);
    const consumed = await consumeAdminMagicLinkToken(parsed.token);
    if (!consumed) {
      return NextResponse.json(
        { ok: false, error: "This sign-in link is invalid, expired, or already used." },
        { status: 401 },
      );
    }

    const normalizedEmail = consumed.email.trim().toLowerCase();

    const setup = await prisma.storeSettings.findFirst({
      select: { setupComplete: true },
      orderBy: { createdAt: "asc" },
    });

    if (!setup?.setupComplete) {
      const stepOneState = await getStepOneState();
      if (!isStepOneComplete(stepOneState)) {
        return NextResponse.json(
          { ok: false, error: "Setup basics are incomplete." },
          { status: 409 },
        );
      }

      await completeSetup({
        orgName: stepOneState.orgName,
        storeName: stepOneState.storeName,
        contactEmail: stepOneState.contactEmail,
        currency: stepOneState.currency,
        adminEmail: normalizedEmail,
      });
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        organizations: { select: { id: true }, take: 1 },
        memberships: {
          where: { role: { in: [MembershipRole.OWNER, MembershipRole.ADMIN] } },
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "This magic link is not associated with an admin user." },
        { status: 403 },
      );
    }

    const hasAdminAccess =
      user.organizations.length > 0 || user.memberships.length > 0;

    if (!hasAdminAccess) {
      return NextResponse.json(
        { ok: false, error: "This magic link is not associated with an admin user." },
        { status: 403 },
      );
    }

    const response = NextResponse.json({ ok: true, redirectTo: "/admin" });
    response.cookies.set({
      name: getAdminSessionCookieName(),
      value: createAdminSessionCookieValue({
        userId: user.id,
        email: user.email,
      }),
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: getAdminSessionTtlSeconds(),
    });
    response.cookies.set({
      name: getSetupSessionCookieName(),
      value: "",
      path: "/",
      maxAge: 0,
    });

    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: "Invalid magic link token." },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { ok: false, error: "Could not complete admin sign-in." },
      { status: 500 },
    );
  }
}
