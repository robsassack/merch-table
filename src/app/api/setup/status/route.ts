import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const settings = await prisma.storeSettings.findFirst({
    select: {
      setupComplete: true,
      storeStatus: true,
      storeName: true,
      brandName: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(
    {
      setupComplete: settings?.setupComplete ?? false,
      storeStatus: settings?.storeStatus ?? "SETUP",
      storeName: settings?.storeName ?? null,
      brandName: settings?.brandName ?? null,
    },
    {
      headers: {
        "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    },
  );
}
