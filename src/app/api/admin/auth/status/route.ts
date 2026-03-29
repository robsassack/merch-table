import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { hasValidAdminSession } from "@/lib/auth/admin-session";

export const runtime = "nodejs";

export async function GET() {
  const cookieStore = await cookies();
  const authenticated = hasValidAdminSession(cookieStore);

  return NextResponse.json(
    { authenticated },
    {
      headers: {
        "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    },
  );
}
