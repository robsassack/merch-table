import { NextResponse } from "next/server";

import { requireAdminRequestContext } from "@/lib/admin/request-context";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const FACTORY_RESET_CONFIRMATION_TEXT = "RESET STORE";

export async function GET() {
  const auth = await requireAdminRequestContext();
  if (!auth.ok) {
    return auth.response;
  }

  const [storeSettings, migrationRuns] = await Promise.all([
    prisma.storeSettings.findFirst({
      where: { organizationId: auth.context.organizationId },
      select: {
        setupComplete: true,
        storeStatus: true,
        updatedAt: true,
      },
    }),
    prisma.storageMigrationRun.findMany({
      where: { organizationId: auth.context.organizationId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        status: true,
        sourceProvider: true,
        targetProvider: true,
        runtimeSwitchPending: true,
        totalObjects: true,
        copiedObjects: true,
        message: true,
        startedAt: true,
        finishedAt: true,
        initiatedBy: {
          select: {
            email: true,
          },
        },
      },
    }),
  ]);

  return NextResponse.json(
    {
      ok: true,
      data: {
        factoryResetConfirmation: FACTORY_RESET_CONFIRMATION_TEXT,
        storeStatus: {
          setupComplete: storeSettings?.setupComplete ?? false,
          storeStatus: storeSettings?.storeStatus ?? "SETUP",
          updatedAt: storeSettings?.updatedAt?.toISOString() ?? null,
        },
        migrationHistory: migrationRuns.map((run) => ({
          id: run.id,
          status: run.status,
          sourceProvider: run.sourceProvider,
          targetProvider: run.targetProvider,
          runtimeSwitchPending: run.runtimeSwitchPending,
          totalObjects: run.totalObjects,
          copiedObjects: run.copiedObjects,
          message: run.message,
          startedAt: run.startedAt.toISOString(),
          finishedAt: run.finishedAt.toISOString(),
          initiatedByEmail: run.initiatedBy.email,
        })),
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
