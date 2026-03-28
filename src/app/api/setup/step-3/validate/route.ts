import { NextResponse } from "next/server";

import { enforceCsrfProtection } from "@/lib/security/csrf";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { SAFE_EXTERNAL_ERROR_MESSAGES } from "@/lib/security/safe-errors";
import { setupRateLimitPolicies } from "@/lib/security/setup-policies";
import { hasSetupAccess } from "@/lib/setup/access";
import { getStepOneState, isStepOneComplete } from "@/lib/setup/step-one";
import { getStepTwoState, isStepTwoComplete } from "@/lib/setup/step-two";
import {
  markStorageValidationFailed,
  validateExternalS3Credentials,
} from "@/lib/setup/step-three";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const csrfError = enforceCsrfProtection(request);
  if (csrfError) {
    return csrfError;
  }

  const rateLimitError = enforceRateLimit(
    request,
    setupRateLimitPolicies.verifyStorage,
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
      { error: "Complete Step 1 before validating storage." },
      { status: 409 },
    );
  }

  const stepTwoState = await getStepTwoState(stepOneState.contactEmail);
  if (!isStepTwoComplete(stepTwoState)) {
    return NextResponse.json(
      { error: "Complete Step 2 before validating storage." },
      { status: 409 },
    );
  }

  try {
    const result = await validateExternalS3Credentials();
    return NextResponse.json({ ok: true, ...result });
  } catch {
    const message = SAFE_EXTERNAL_ERROR_MESSAGES.storageValidation;
    await markStorageValidationFailed(message);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
