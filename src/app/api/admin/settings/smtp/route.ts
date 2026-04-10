import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminRequestContext } from "@/lib/admin/request-context";
import { enforceCsrfProtection } from "@/lib/security/csrf";
import { getStepTwoState, saveStepTwoState, stepTwoSchema } from "@/lib/setup/step-two";

export const runtime = "nodejs";

const updateSmtpSettingsSchema = stepTwoSchema.extend({
  smtpProviderPreset: z.string().trim().min(1).default("custom"),
  smtpPort: z.coerce.number().int().min(1).max(65535),
  smtpSecure: z.coerce.boolean(),
});

export async function GET() {
  const auth = await requireAdminRequestContext();
  if (!auth.ok) {
    return auth.response;
  }

  const state = await getStepTwoState();
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
    const parsed = updateSmtpSettingsSchema.parse(payload);
    await saveStepTwoState(parsed);
    const state = await getStepTwoState();
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
