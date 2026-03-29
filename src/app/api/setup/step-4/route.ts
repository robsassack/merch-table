import { NextResponse } from "next/server";
import { z } from "zod";

import { enforceCsrfProtection } from "@/lib/security/csrf";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { setupRateLimitPolicies } from "@/lib/security/setup-policies";
import { hasSetupAccess } from "@/lib/setup/access";
import { getStepFourState, saveStepFourState, stepFourSchema } from "@/lib/setup/step-four";
import { getStepOneState, isStepOneComplete } from "@/lib/setup/step-one";
import { getStepThreeState, isStepThreeComplete } from "@/lib/setup/step-three";
import { getStepTwoState, isStepTwoComplete } from "@/lib/setup/step-two";

export const runtime = "nodejs";

const stepFourRequestSchema = stepFourSchema.extend({
  stripeSecretKey: z.string().trim().max(255),
  stripeWebhookSecret: z.string().trim().min(1).max(255),
});

export async function GET() {
  const allowed = await hasSetupAccess();
  if (!allowed) {
    return NextResponse.json({ error: "Setup access required." }, { status: 401 });
  }

  const stepOneState = await getStepOneState();
  if (!isStepOneComplete(stepOneState)) {
    return NextResponse.json(
      { error: "Complete Step 1 before accessing Step 4." },
      { status: 409 },
    );
  }

  const stepTwoState = await getStepTwoState(stepOneState.contactEmail);
  if (!isStepTwoComplete(stepTwoState)) {
    return NextResponse.json(
      { error: "Complete Step 2 before accessing Step 4." },
      { status: 409 },
    );
  }

  const stepThreeState = await getStepThreeState();
  if (!isStepThreeComplete(stepThreeState)) {
    return NextResponse.json(
      { error: "Complete Step 3 before accessing Step 4." },
      { status: 409 },
    );
  }

  const state = await getStepFourState();
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
      { error: "Complete Step 1 before accessing Step 4." },
      { status: 409 },
    );
  }

  const stepTwoState = await getStepTwoState(stepOneState.contactEmail);
  if (!isStepTwoComplete(stepTwoState)) {
    return NextResponse.json(
      { error: "Complete Step 2 before accessing Step 4." },
      { status: 409 },
    );
  }

  const stepThreeState = await getStepThreeState();
  if (!isStepThreeComplete(stepThreeState)) {
    return NextResponse.json(
      { error: "Complete Step 3 before accessing Step 4." },
      { status: 409 },
    );
  }

  try {
    const payload = await request.json();
    const parsed = stepFourRequestSchema.parse(payload);
    const saved = await saveStepFourState(parsed);
    return NextResponse.json({ ok: true, data: saved });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: "Invalid Stripe settings.", issues: error.issues },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { ok: false, error: "Failed to save Stripe settings." },
      { status: 500 },
    );
  }
}
