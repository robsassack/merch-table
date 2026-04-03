import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminRequestContext } from "@/lib/admin/request-context";
import { enforceCsrfProtection } from "@/lib/security/csrf";
import { getStepFourState, saveStepFourState, stepFourSchema } from "@/lib/setup/step-four";

export const runtime = "nodejs";

const updateStripeSettingsSchema = stepFourSchema.extend({
  stripeSecretKey: z.string().trim().max(255),
  stripeWebhookSecret: z.string().trim().min(1).max(255),
});

export async function GET() {
  const auth = await requireAdminRequestContext();
  if (!auth.ok) {
    return auth.response;
  }

  const state = await getStepFourState();
  return NextResponse.json(
    { ok: true, data: state },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const csrfError = enforceCsrfProtection(request);
  if (csrfError) {
    return csrfError;
  }

  const auth = await requireAdminRequestContext();
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const payload = await request.json();
    const parsed = updateStripeSettingsSchema.parse(payload);
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
