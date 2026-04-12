import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

type SetupStatusResponse = {
  setupComplete: boolean;
  storeStatus: "SETUP" | "PRIVATE" | "PUBLIC";
};

type AdminAuthStatusResponse = {
  authenticated: boolean;
};

function resolveProxyBaseUrl(request: NextRequest) {
  const configured = process.env.APP_BASE_URL?.trim();
  if (!configured) {
    return request.nextUrl.origin;
  }

  return configured.replace(/\/+$/, "");
}

async function isSetupComplete(request: NextRequest) {
  const baseUrl = resolveProxyBaseUrl(request);

  try {
    const response = await fetch(`${baseUrl}/api/setup/status`, {
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
  const baseUrl = resolveProxyBaseUrl(request);

  try {
    const forwardedHeaders = new Headers(request.headers);
    forwardedHeaders.set("x-merch-table-proxy", "admin-auth-gate");

    const response = await fetch(`${baseUrl}/api/admin/auth/status`, {
      method: "GET",
      cache: "no-store",
      headers: forwardedHeaders,
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
  const isLibraryPath = pathname === "/library";
  const isFindPurchasesPath = pathname === "/find-my-purchases";
  const isMediaPath = pathname.startsWith("/media/");

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
    const isBuyerFulfillmentPath = isLibraryPath || isFindPurchasesPath;
    if (!isAdminPath && !isMaintenancePath && !isApiPath && !isBuyerFulfillmentPath && !isMediaPath) {
      return NextResponse.redirect(new URL("/coming-soon", request.url));
    }
  }

  if (setup.storeStatus === "PUBLIC" && isMaintenancePath) {
    return NextResponse.redirect(new URL("/", request.url));
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
    "/((?!api/setup|api/admin/auth|api/auth|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
