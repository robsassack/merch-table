import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminRequestContext } from "@/lib/admin/request-context";
import {
  createSetupSessionCookieValue,
  getSetupSessionCookieName,
  getSetupSessionTtlSeconds,
} from "@/lib/auth/setup-session";
import { prisma } from "@/lib/prisma";
import { enforceCsrfProtection } from "@/lib/security/csrf";

export const runtime = "nodejs";

const FACTORY_RESET_CONFIRMATION_TEXT = "RESET STORE";

const factoryResetSchema = z.object({
  confirmation: z.string().trim().min(1, "Factory reset confirmation text is required."),
});

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
    const parsed = factoryResetSchema.parse(payload);

    if (parsed.confirmation !== FACTORY_RESET_CONFIRMATION_TEXT) {
      return NextResponse.json(
        {
          ok: false,
          error: "Factory reset confirmation text does not match.",
          requiredConfirmation: FACTORY_RESET_CONFIRMATION_TEXT,
        },
        { status: 400 },
      );
    }

    const now = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.storeSettings.updateMany({
        where: { organizationId: auth.context.organizationId },
        data: {
          setupComplete: false,
          storeStatus: "SETUP",
          updatedAt: now,
        },
      });

      await tx.setupWizardState.upsert({
        where: { singletonKey: 1 },
        create: {
          singletonKey: 1,
          adminEmail: auth.context.session.email,
        },
        update: {
          adminEmail: auth.context.session.email,
          adminMagicLinkSentAt: null,
          adminMagicLinkLastError: null,
        },
      });
    });

    const response = NextResponse.json({
      ok: true,
      redirectTo: "/setup",
      message: "Factory reset started. Complete the setup wizard to re-open the store.",
    });

    response.cookies.set({
      name: getSetupSessionCookieName(),
      value: createSetupSessionCookieValue(),
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: getSetupSessionTtlSeconds(),
    });

    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: "Invalid factory reset request.", issues: error.issues },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Factory reset failed.",
      },
      { status: 400 },
    );
  }
}
