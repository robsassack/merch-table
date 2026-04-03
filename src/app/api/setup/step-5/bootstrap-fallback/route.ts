import { NextResponse } from "next/server";

import { serializeSignedSessionTokenCookie } from "@/lib/auth/better-auth-session-cookie";
import { getSetupSessionCookieName } from "@/lib/auth/setup-session";
import { auth } from "@/lib/better-auth";
import { claimBootstrapSetupToken } from "@/lib/bootstrap/setup-token";
import { prisma } from "@/lib/prisma";
import { enforceCsrfProtection } from "@/lib/security/csrf";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { setupRateLimitPolicies } from "@/lib/security/setup-policies";
import { hasSetupAccess } from "@/lib/setup/access";
import { getStepFiveState } from "@/lib/setup/step-five";
import { getStepFourState, isStepFourComplete } from "@/lib/setup/step-four";
import { getStepOneState, isStepOneComplete } from "@/lib/setup/step-one";
import { completeSetup } from "@/lib/setup/step-six";
import { getStepThreeState, isStepThreeComplete } from "@/lib/setup/step-three";
import { getStepTwoState, isStepTwoComplete } from "@/lib/setup/step-two";

export const runtime = "nodejs";

async function setBetterAuthSessionCookie(
  response: NextResponse,
  input: { userId: string },
) {
  const context = await auth.$context;
  const session = await context.internalAdapter.createSession(input.userId);
  const serialized = await serializeSignedSessionTokenCookie({
    token: session.token,
    secret: context.secret,
    cookie: context.authCookies.sessionToken,
  });
  response.headers.append("set-cookie", serialized);
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

  const allowed = await hasSetupAccess();
  if (!allowed) {
    return NextResponse.json({ error: "Setup access required." }, { status: 401 });
  }

  const stepOneState = await getStepOneState();
  if (!isStepOneComplete(stepOneState)) {
    return NextResponse.json(
      { error: "Complete Step 1 before fallback sign-in." },
      { status: 409 },
    );
  }

  const stepTwoState = await getStepTwoState(stepOneState.contactEmail);
  if (!isStepTwoComplete(stepTwoState)) {
    return NextResponse.json(
      { error: "Complete Step 2 before fallback sign-in." },
      { status: 409 },
    );
  }

  const stepThreeState = await getStepThreeState();
  if (!isStepThreeComplete(stepThreeState)) {
    return NextResponse.json(
      { error: "Complete Step 3 before fallback sign-in." },
      { status: 409 },
    );
  }

  const stepFourState = await getStepFourState();
  if (!isStepFourComplete(stepFourState)) {
    return NextResponse.json(
      { error: "Complete Step 4 before fallback sign-in." },
      { status: 409 },
    );
  }

  const stepFiveState = await getStepFiveState();
  if (!stepFiveState.adminEmail) {
    return NextResponse.json(
      { error: "Save admin email before fallback sign-in." },
      { status: 409 },
    );
  }

  const payload = (await request.json().catch(() => null)) as
    | { bootstrapToken?: string }
    | null;
  const bootstrapToken = payload?.bootstrapToken?.trim();
  if (!bootstrapToken) {
    return NextResponse.json(
      { ok: false, error: "Bootstrap token is required." },
      { status: 400 },
    );
  }

  const claimed = await claimBootstrapSetupToken(bootstrapToken);
  if (!claimed) {
    return NextResponse.json(
      { ok: false, error: "Invalid or expired bootstrap token." },
      { status: 401 },
    );
  }

  await completeSetup({
    orgName: stepOneState.orgName,
    storeName: stepOneState.storeName,
    contactEmail: stepOneState.contactEmail,
    currency: stepOneState.currency,
    adminEmail: stepFiveState.adminEmail.trim().toLowerCase(),
  });

  const user = await prisma.user.findUnique({
    where: { email: stepFiveState.adminEmail.trim().toLowerCase() },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Could not create admin account from fallback." },
      { status: 500 },
    );
  }

  const response = NextResponse.json({ ok: true, redirectTo: "/admin" });
  response.cookies.set({
    name: getSetupSessionCookieName(),
    value: "",
    path: "/",
    maxAge: 0,
  });
  await setBetterAuthSessionCookie(response, { userId: user.id });

  return response;
}
