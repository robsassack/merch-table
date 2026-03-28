import { NextResponse } from "next/server";

import { enforceCsrfProtection } from "@/lib/security/csrf";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { SAFE_EXTERNAL_ERROR_MESSAGES } from "@/lib/security/safe-errors";
import { setupRateLimitPolicies } from "@/lib/security/setup-policies";
import { hasSetupAccess } from "@/lib/setup/access";
import {
  markStripeVerificationFailed,
  verifyStripeConnection,
} from "@/lib/setup/step-four";
import { getStepOneState, isStepOneComplete } from "@/lib/setup/step-one";
import { getStepThreeState, isStepThreeComplete } from "@/lib/setup/step-three";
import { getStepTwoState, isStepTwoComplete } from "@/lib/setup/step-two";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const csrfError = enforceCsrfProtection(request);
  if (csrfError) {
    return csrfError;
  }

  const rateLimitError = enforceRateLimit(
    request,
    setupRateLimitPolicies.verifyStripe,
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
      { error: "Complete Step 1 before verifying Stripe." },
      { status: 409 },
    );
  }

  const stepTwoState = await getStepTwoState(stepOneState.contactEmail);
  if (!isStepTwoComplete(stepTwoState)) {
    return NextResponse.json(
      { error: "Complete Step 2 before verifying Stripe." },
      { status: 409 },
    );
  }

  const stepThreeState = await getStepThreeState();
  if (!isStepThreeComplete(stepThreeState)) {
    return NextResponse.json(
      { error: "Complete Step 3 before verifying Stripe." },
      { status: 409 },
    );
  }

  try {
    const result = await verifyStripeConnection();
    return NextResponse.json({ ok: true, ...result });
  } catch {
    const message = SAFE_EXTERNAL_ERROR_MESSAGES.stripeVerification;
    await markStripeVerificationFailed(message);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
