import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { userHasAdminAccessToOrganization } from "@/lib/auth/admin-access";
import { readAdminSession } from "@/lib/auth/admin-session";
import { prisma } from "@/lib/prisma";

export type AdminRequestContext = {
  organizationId: string;
  session: {
    userId: string;
    email: string;
    expiresAt: number;
    organizationId?: string;
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

  if (
    session.organizationId &&
    session.organizationId !== setup.organizationId
  ) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Admin session is not valid for this organization." },
        { status: 403 },
      ),
    };
  }

  const hasAccess = await userHasAdminAccessToOrganization({
    userId: session.userId,
    organizationId: setup.organizationId,
  });
  if (!hasAccess) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Admin access is required for this organization." },
        { status: 403 },
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
