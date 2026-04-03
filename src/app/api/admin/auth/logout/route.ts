import { NextResponse } from "next/server";

import { auth } from "@/lib/better-auth";
import { enforceCsrfProtection } from "@/lib/security/csrf";

export const runtime = "nodejs";

async function clearBetterAuthSessionCookies(response: NextResponse) {
  const context = await auth.$context;

  response.cookies.set({
    name: context.authCookies.sessionToken.name,
    value: "",
    path: context.authCookies.sessionToken.attributes.path ?? "/",
    maxAge: 0,
  });

  response.cookies.set({
    name: context.authCookies.sessionData.name,
    value: "",
    path: context.authCookies.sessionData.attributes.path ?? "/",
    maxAge: 0,
  });
}

export async function POST(request: Request) {
  const csrfError = enforceCsrfProtection(request);
  if (csrfError) {
    return csrfError;
  }

  const context = await auth.$context;

  try {
    const authSession = await auth.api.getSession({
      headers: request.headers,
      query: {
        disableCookieCache: true,
        disableRefresh: true,
      },
    });

    if (authSession?.session?.token) {
      await context.internalAdapter.deleteSession(authSession.session.token);
    }
  } catch (error) {
    console.error("[auth] Failed to delete admin session during sign-out", error);
  }

  const response = NextResponse.json({ ok: true, redirectTo: "/admin/auth" });
  response.headers.set("cache-control", "no-store, no-cache, max-age=0");
  await clearBetterAuthSessionCookies(response);

  return response;
}
