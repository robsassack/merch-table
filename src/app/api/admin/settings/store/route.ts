import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminRequestContext } from "@/lib/admin/request-context";
import { enforceCsrfProtection } from "@/lib/security/csrf";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const updateStoreSettingsSchema = z.object({
  contactEmail: z.email("Enter a valid contact email.").max(320),
});

export async function GET() {
  const auth = await requireAdminRequestContext();
  if (!auth.ok) {
    return auth.response;
  }

  const settings = await prisma.storeSettings.findFirst({
    where: { organizationId: auth.context.organizationId },
    select: { contactEmail: true },
  });

  return NextResponse.json(
    { ok: true, data: { contactEmail: settings?.contactEmail ?? "" } },
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
    const parsed = updateStoreSettingsSchema.parse(payload);

    await prisma.storeSettings.updateMany({
      where: { organizationId: auth.context.organizationId },
      data: { contactEmail: parsed.contactEmail },
    });

    return NextResponse.json({ ok: true, data: { contactEmail: parsed.contactEmail } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: "Invalid contact email.", issues: error.issues },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { ok: false, error: "Failed to save store settings." },
      { status: 500 },
    );
  }
}
