import { NextResponse } from "next/server";

import { requireAdminRequestContext } from "@/lib/admin/request-context";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireAdminRequestContext();
  const authenticated = auth.ok;

  return NextResponse.json(
    { authenticated },
    {
      headers: {
        "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    },
  );
}
