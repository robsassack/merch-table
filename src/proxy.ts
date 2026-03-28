import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

type SetupStatusResponse = {
  setupComplete: boolean;
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

export async function proxy(request: NextRequest) {
  const setupComplete = await isSetupComplete(request);

  if (setupComplete) {
    return NextResponse.next();
  }

  const setupUrl = new URL("/setup", request.url);
  return NextResponse.redirect(setupUrl);
}

export const config = {
  matcher: [
    "/((?!setup|api/setup|admin/auth/magic-link|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
