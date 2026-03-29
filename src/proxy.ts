import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

type SetupStatusResponse = {
  setupComplete: boolean;
  storeStatus: "SETUP" | "PRIVATE" | "PUBLIC";
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
      return {
        setupComplete: false,
        storeStatus: "SETUP" as const,
      };
    }

    const payload = (await response.json()) as SetupStatusResponse;
    return {
      setupComplete: payload.setupComplete === true,
      storeStatus: payload.storeStatus,
    };
  } catch {
    return {
      setupComplete: false,
      storeStatus: "SETUP" as const,
    };
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
  const setup = await isSetupComplete(request);
  const { pathname } = request.nextUrl;

  const isSetupPath = pathname.startsWith("/setup") || pathname.startsWith("/api/setup");
  const isAdminAuthPath = pathname.startsWith("/admin/auth");
  const isAdminPath = pathname.startsWith("/admin");
  const isApiPath = pathname.startsWith("/api/");
  const isMaintenancePath = pathname === "/coming-soon";
  const isSetupMagicLinkPath = pathname.startsWith("/admin/auth/magic-link");

  if (setup.storeStatus === "SETUP" || !setup.setupComplete) {
    if (isSetupPath || isSetupMagicLinkPath) {
      return NextResponse.next();
    }

    const setupUrl = new URL("/setup", request.url);
    return NextResponse.redirect(setupUrl);
  }

  if (isSetupPath) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  if (setup.storeStatus === "PRIVATE") {
    if (!isAdminPath && !isMaintenancePath && !isApiPath) {
      return NextResponse.redirect(new URL("/coming-soon", request.url));
    }
  }

  if (isAdminPath && !isAdminAuthPath) {
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
    "/((?!api/setup|api/admin/auth|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
