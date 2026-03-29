import { NextResponse } from "next/server";
import { z } from "zod";

import { enforceCsrfProtection } from "@/lib/security/csrf";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { setupRateLimitPolicies } from "@/lib/security/setup-policies";
import { hasSetupAccess } from "@/lib/setup/access";
import { getStepOneState, saveStepOneState, stepOneSchema } from "@/lib/setup/step-one";

export const runtime = "nodejs";

export async function GET() {
  const allowed = await hasSetupAccess();

  if (!allowed) {
    return NextResponse.json({ error: "Setup access required." }, { status: 401 });
  }

  const state = await getStepOneState();
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

  try {
    const payload = await request.json();
    const parsed = stepOneSchema.parse(payload);
    const saved = await saveStepOneState(parsed);

    return NextResponse.json({ ok: true, data: saved });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid setup input.",
          issues: error.issues,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { ok: false, error: "Failed to save setup basics." },
      { status: 500 },
    );
  }
}
