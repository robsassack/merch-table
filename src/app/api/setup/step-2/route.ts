import { NextResponse } from "next/server";
import { z } from "zod";

import { enforceCsrfProtection } from "@/lib/security/csrf";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { setupRateLimitPolicies } from "@/lib/security/setup-policies";
import { hasSetupAccess } from "@/lib/setup/access";
import { getStepOneState, isStepOneComplete } from "@/lib/setup/step-one";
import { getStepTwoState, saveStepTwoState, stepTwoSchema } from "@/lib/setup/step-two";

export const runtime = "nodejs";

const stepTwoRequestSchema = stepTwoSchema.extend({
  smtpProviderPreset: z.string().trim().min(1).default("custom"),
  smtpPort: z.coerce.number().int().min(1).max(65535),
  smtpSecure: z.coerce.boolean(),
});

export async function GET() {
  const allowed = await hasSetupAccess();
  if (!allowed) {
    return NextResponse.json({ error: "Setup access required." }, { status: 401 });
  }

  const stepOneState = await getStepOneState();
  if (!isStepOneComplete(stepOneState)) {
    return NextResponse.json(
      { error: "Complete Step 1 before accessing Step 2." },
      { status: 409 },
    );
  }

  const stepTwoState = await getStepTwoState(stepOneState.contactEmail);
  return NextResponse.json(stepTwoState, { headers: { "cache-control": "no-store" } });
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
      { error: "Complete Step 1 before accessing Step 2." },
      { status: 409 },
    );
  }

  try {
    const payload = await request.json();
    const parsed = stepTwoRequestSchema.parse(payload);
    await saveStepTwoState(parsed);

    const state = await getStepTwoState(stepOneState.contactEmail);
    return NextResponse.json({ ok: true, data: state });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: "Invalid SMTP settings.", issues: error.issues },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { ok: false, error: "Failed to save SMTP settings." },
      { status: 500 },
    );
  }
}
