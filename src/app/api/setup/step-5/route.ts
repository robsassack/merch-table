import { NextResponse } from "next/server";
import { z } from "zod";

import { enforceCsrfProtection } from "@/lib/security/csrf";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { setupRateLimitPolicies } from "@/lib/security/setup-policies";
import { hasSetupAccess } from "@/lib/setup/access";
import { isStepFourComplete } from "@/lib/setup/step-four";
import { getStepOneState, isStepOneComplete } from "@/lib/setup/step-one";
import { getStepThreeState, isStepThreeComplete } from "@/lib/setup/step-three";
import { getStepTwoState, isStepTwoComplete } from "@/lib/setup/step-two";
import { getStepFourState } from "@/lib/setup/step-four";
import { getStepFiveState, saveStepFiveState, stepFiveSchema } from "@/lib/setup/step-five";

export const runtime = "nodejs";

const stepFiveRequestSchema = stepFiveSchema.extend({
  adminEmail: z.email().max(320),
});

export async function GET() {
  const allowed = await hasSetupAccess();
  if (!allowed) {
    return NextResponse.json({ error: "Setup access required." }, { status: 401 });
  }

  const stepOneState = await getStepOneState();
  if (!isStepOneComplete(stepOneState)) {
    return NextResponse.json(
      { error: "Complete Step 1 before accessing Step 5." },
      { status: 409 },
    );
  }

  const stepTwoState = await getStepTwoState(stepOneState.contactEmail);
  if (!isStepTwoComplete(stepTwoState)) {
    return NextResponse.json(
      { error: "Complete Step 2 before accessing Step 5." },
      { status: 409 },
    );
  }

  const stepThreeState = await getStepThreeState();
  if (!isStepThreeComplete(stepThreeState)) {
    return NextResponse.json(
      { error: "Complete Step 3 before accessing Step 5." },
      { status: 409 },
    );
  }

  const stepFourState = await getStepFourState();
  if (!isStepFourComplete(stepFourState)) {
    return NextResponse.json(
      { error: "Complete Step 4 before accessing Step 5." },
      { status: 409 },
    );
  }

  const state = await getStepFiveState();
  return NextResponse.json(state, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const csrfError = enforceCsrfProtection(request);
  if (csrfError) {
    return csrfError;
  }

  const rateLimitError = await enforceRateLimit(request, setupRateLimitPolicies.saveStep);
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
      { error: "Complete Step 1 before accessing Step 5." },
      { status: 409 },
    );
  }

  const stepTwoState = await getStepTwoState(stepOneState.contactEmail);
  if (!isStepTwoComplete(stepTwoState)) {
    return NextResponse.json(
      { error: "Complete Step 2 before accessing Step 5." },
      { status: 409 },
    );
  }

  const stepThreeState = await getStepThreeState();
  if (!isStepThreeComplete(stepThreeState)) {
    return NextResponse.json(
      { error: "Complete Step 3 before accessing Step 5." },
      { status: 409 },
    );
  }

  const stepFourState = await getStepFourState();
  if (!isStepFourComplete(stepFourState)) {
    return NextResponse.json(
      { error: "Complete Step 4 before accessing Step 5." },
      { status: 409 },
    );
  }

  try {
    const payload = await request.json();
    const parsed = stepFiveRequestSchema.parse(payload);
    const saved = await saveStepFiveState(parsed);
    return NextResponse.json({ ok: true, data: saved });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: "Invalid admin email.", issues: error.issues },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { ok: false, error: "Failed to save admin email." },
      { status: 500 },
    );
  }
}
