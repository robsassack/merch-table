import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const settings = await prisma.storeSettings.findFirst({
    select: { setupComplete: true, storeStatus: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(
    {
      setupComplete: settings?.setupComplete ?? false,
      storeStatus: settings?.storeStatus ?? "SETUP",
    },
    {
      headers: {
        "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    },
  );
}
