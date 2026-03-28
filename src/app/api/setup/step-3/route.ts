import { NextResponse } from "next/server";

import { enforceCsrfProtection } from "@/lib/security/csrf";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { setupRateLimitPolicies } from "@/lib/security/setup-policies";
import { hasSetupAccess } from "@/lib/setup/access";
import { getStepOneState, isStepOneComplete } from "@/lib/setup/step-one";
import { isStepTwoComplete } from "@/lib/setup/step-two";
import { getStepThreeState, saveStepThreeState, stepThreeSchema } from "@/lib/setup/step-three";
import { getStepTwoState } from "@/lib/setup/step-two";

export const runtime = "nodejs";

export async function GET() {
  const allowed = await hasSetupAccess();
  if (!allowed) {
    return NextResponse.json({ error: "Setup access required." }, { status: 401 });
  }

  const stepOneState = await getStepOneState();
  if (!isStepOneComplete(stepOneState)) {
    return NextResponse.json(
      { error: "Complete Step 1 before accessing Step 3." },
      { status: 409 },
    );
  }

  const stepTwoState = await getStepTwoState(stepOneState.contactEmail);
  if (!isStepTwoComplete(stepTwoState)) {
    return NextResponse.json(
      { error: "Complete Step 2 before accessing Step 3." },
      { status: 409 },
    );
  }

  const stepThreeState = await getStepThreeState();
  return NextResponse.json(stepThreeState, {
    headers: { "cache-control": "no-store" },
  });
}

export async function POST(request: Request) {
  const csrfError = enforceCsrfProtection(request);
  if (csrfError) {
    return csrfError;
  }

  const rateLimitError = enforceRateLimit(request, setupRateLimitPolicies.saveStep);
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
      { error: "Complete Step 1 before accessing Step 3." },
      { status: 409 },
    );
  }

  const stepTwoState = await getStepTwoState(stepOneState.contactEmail);
  if (!isStepTwoComplete(stepTwoState)) {
    return NextResponse.json(
      { error: "Complete Step 2 before accessing Step 3." },
      { status: 409 },
    );
  }

  try {
    const payload = await request.json();
    const parsed = stepThreeSchema.parse(payload);
    const saved = await saveStepThreeState(parsed);

    return NextResponse.json({ ok: true, data: saved });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        { ok: false, error: "Invalid storage settings." },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { ok: false, error: "Failed to save storage settings." },
      { status: 500 },
    );
  }
}
