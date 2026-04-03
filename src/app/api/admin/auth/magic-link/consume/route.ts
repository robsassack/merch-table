import { APIError } from "better-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { userHasAdminAccessToOrganization } from "@/lib/auth/admin-access";
import { enforceAdminMagicLinkAccess } from "@/lib/auth/admin-magic-link-access";
import { serializeSignedSessionTokenCookie } from "@/lib/auth/better-auth-session-cookie";
import { getSetupSessionCookieName } from "@/lib/auth/setup-session";
import { auth } from "@/lib/better-auth";
import { prisma } from "@/lib/prisma";
import { authRateLimitPolicies } from "@/lib/security/auth-policies";
import { enforceCsrfProtection } from "@/lib/security/csrf";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { getStepOneState, isStepOneComplete } from "@/lib/setup/step-one";
import { completeSetup } from "@/lib/setup/step-six";

export const runtime = "nodejs";

const consumeSchema = z.object({
  token: z.string().trim().min(1),
});

async function revokeIssuedSessionToken(token: string) {
  const context = await auth.$context;
  await context.internalAdapter.deleteSession(token);
}

async function appendSignedBetterAuthSessionCookie(
  response: NextResponse,
  input: { token: string },
) {
  const context = await auth.$context;
  const serialized = await serializeSignedSessionTokenCookie({
    token: input.token,
    secret: context.secret,
    cookie: context.authCookies.sessionToken,
  });

  response.headers.append("set-cookie", serialized);
}

async function clearBetterAuthSessionCookies(response: NextResponse) {
  const context = await auth.$context;

  response.cookies.set({
    name: context.authCookies.sessionToken.name,
    value: "",
    path: context.authCookies.sessionToken.attributes.path ?? "/",
    maxAge: 0,
  });

  response.cookies.set({
    name: context.authCookies.sessionData.name,
    value: "",
    path: context.authCookies.sessionData.attributes.path ?? "/",
    maxAge: 0,
  });
}

function isBetterAuthApiError(error: unknown) {
  if (error instanceof APIError) {
    return true;
  }

  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { name?: unknown };
  return candidate.name === "APIError";
}

export async function POST(request: Request) {
  const csrfError = enforceCsrfProtection(request);
  if (csrfError) {
    return csrfError;
  }

  const rateLimitError = await enforceRateLimit(
    request,
    authRateLimitPolicies.consumeLinkByIp,
  );
  if (rateLimitError) {
    return rateLimitError;
  }

  try {
    const payload = await request.json();
    const parsed = consumeSchema.parse(payload);

    const verification = await auth.api.magicLinkVerify({
      query: { token: parsed.token },
      headers: request.headers,
    });

    const normalizedEmail = verification.user.email.trim().toLowerCase();

    const setup = await prisma.storeSettings.findFirst({
      select: { setupComplete: true, organizationId: true },
      orderBy: { createdAt: "asc" },
    });
    let organizationId = setup?.organizationId ?? null;

    if (!setup?.setupComplete) {
      const stepOneState = await getStepOneState();
      if (!isStepOneComplete(stepOneState)) {
        await revokeIssuedSessionToken(verification.token);
        return NextResponse.json(
          { ok: false, error: "Setup basics are incomplete." },
          { status: 409 },
        );
      }

      const setupResult = await completeSetup({
        orgName: stepOneState.orgName,
        storeName: stepOneState.storeName,
        contactEmail: stepOneState.contactEmail,
        currency: stepOneState.currency,
        adminEmail: normalizedEmail,
      });
      organizationId = setupResult.organizationId;
    }

    if (!organizationId) {
      await revokeIssuedSessionToken(verification.token);
      return NextResponse.json(
        { ok: false, error: "Could not resolve admin organization." },
        { status: 500 },
      );
    }

    const hasAdminAccess = await userHasAdminAccessToOrganization({
      userId: verification.user.id,
      organizationId,
    });

    const access = await enforceAdminMagicLinkAccess({
      hasAdminAccess,
      issuedSessionToken: verification.token,
      revokeIssuedSessionToken,
    });
    if (!access.ok) {
      return NextResponse.json(
        { ok: false, error: access.error },
        { status: access.status },
      );
    }

    const response = NextResponse.json({ ok: true, redirectTo: "/admin" });

    response.cookies.set({
      name: getSetupSessionCookieName(),
      value: "",
      path: "/",
      maxAge: 0,
    });

    await clearBetterAuthSessionCookies(response);
    await appendSignedBetterAuthSessionCookie(response, {
      token: verification.token,
    });

    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: "Invalid magic link token." },
        { status: 400 },
      );
    }

    if (isBetterAuthApiError(error)) {
      return NextResponse.json(
        { ok: false, error: "This sign-in link is invalid, expired, or already used." },
        { status: 401 },
      );
    }

    console.error("[auth] Failed to complete admin magic-link sign-in", error);

    return NextResponse.json(
      { ok: false, error: "Could not complete admin sign-in." },
      { status: 500 },
    );
  }
}
