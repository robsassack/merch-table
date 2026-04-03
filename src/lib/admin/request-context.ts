import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { userHasAdminAccessToOrganization } from "@/lib/auth/admin-access";
import { getSessionWithStrictLookup } from "@/lib/auth/admin-session-lookup";
import { auth } from "@/lib/better-auth";
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
  const requestHeaders = new Headers(await headers());
  const authSession = await getSessionWithStrictLookup({
    headers: requestHeaders,
    getSession: auth.api.getSession,
  });

  if (!authSession) {
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

  const hasAccess = await userHasAdminAccessToOrganization({
    userId: authSession.user.id,
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
      session: {
        userId: authSession.user.id,
        email: authSession.user.email,
        expiresAt: authSession.session.expiresAt.getTime(),
      },
    } satisfies AdminRequestContext,
  };
}
