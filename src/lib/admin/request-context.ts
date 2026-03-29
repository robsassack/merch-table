import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { readAdminSession } from "@/lib/auth/admin-session";
import { prisma } from "@/lib/prisma";

export type AdminRequestContext = {
  organizationId: string;
  session: {
    userId: string;
    email: string;
    expiresAt: number;
  };
};

export async function requireAdminRequestContext() {
  const cookieStore = await cookies();
  const session = readAdminSession(cookieStore);
  if (!session) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Admin authentication required." },
        { status: 401 },
      ),
    };
  }

  const setup = await prisma.storeSettings.findFirst({
    select: { setupComplete: true, organizationId: true },
    orderBy: { createdAt: "asc" },
  });

  if (!setup?.setupComplete) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Setup must be complete before using admin management." },
        { status: 409 },
      ),
    };
  }

  return {
    ok: true as const,
    context: {
      organizationId: setup.organizationId,
      session,
    } satisfies AdminRequestContext,
  };
}
