import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

type SetupStatusResponse = {
  setupComplete: boolean;
};

type AdminAuthStatusResponse = {
  authenticated: boolean;
};

async function isSetupComplete(request: NextRequest) {
  try {
    const response = await fetch(`${request.nextUrl.origin}/api/setup/status`, {
      method: "GET",
      cache: "no-store",
      headers: {
        "x-merch-table-proxy": "setup-gate",
      },
    });

    if (!response.ok) {
      return false;
    }

    const payload = (await response.json()) as SetupStatusResponse;
    return payload.setupComplete === true;
  } catch {
    return false;
  }
}

async function isAdminAuthenticated(request: NextRequest) {
  try {
    const response = await fetch(`${request.nextUrl.origin}/api/admin/auth/status`, {
      method: "GET",
      cache: "no-store",
      headers: {
        "x-merch-table-proxy": "admin-auth-gate",
        cookie: request.headers.get("cookie") ?? "",
      },
    });

    if (!response.ok) {
      return false;
    }

    const payload = (await response.json()) as AdminAuthStatusResponse;
    return payload.authenticated === true;
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const setupComplete = await isSetupComplete(request);

  if (!setupComplete) {
    const setupUrl = new URL("/setup", request.url);
    return NextResponse.redirect(setupUrl);
  }

  if (
    request.nextUrl.pathname.startsWith("/admin") &&
    !request.nextUrl.pathname.startsWith("/admin/auth")
  ) {
    const authenticated = await isAdminAuthenticated(request);
    if (!authenticated) {
      const signInUrl = new URL("/admin/auth", request.url);
      return NextResponse.redirect(signInUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!setup|api/setup|api/admin/auth|admin/auth|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
