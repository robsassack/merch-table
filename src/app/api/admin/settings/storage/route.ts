import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminRequestContext } from "@/lib/admin/request-context";
import {
  adminStorageSettingsSchema,
  listStorageMigrationObjects,
  getRuntimeStorageSnapshot,
} from "@/lib/admin/storage-management";
import { enforceCsrfProtection } from "@/lib/security/csrf";
import { saveStepThreeState } from "@/lib/setup/step-three";
import { buildAdminStorageSettingsData } from "./storage-response";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireAdminRequestContext();
  if (!auth.ok) {
    return auth.response;
  }

  const data = await buildAdminStorageSettingsData({
    organizationId: auth.context.organizationId,
  });

  return NextResponse.json(
    { ok: true, data },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const csrfError = enforceCsrfProtection(request);
  if (csrfError) {
    return csrfError;
  }

  const auth = await requireAdminRequestContext();
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const payload = await request.json();
    const parsed = adminStorageSettingsSchema.parse(payload);

    const [currentData, storageObjects] = await Promise.all([
      buildAdminStorageSettingsData({
        organizationId: auth.context.organizationId,
      }),
      listStorageMigrationObjects({
        organizationId: auth.context.organizationId,
      }),
    ]);

    const modeChanged = parsed.storageMode !== currentData.storageMode;
    const activeStorageMode =
      currentData.runtimeStorage.provider ?? currentData.storageMode;

    if (
      modeChanged &&
      storageObjects.usage.hasAssets &&
      parsed.storageMode !== activeStorageMode
    ) {
      return NextResponse.json(
        {
          ok: false,
          code: "STORAGE_SWITCH_BLOCKED_ASSETS_EXIST",
          error:
            "Storage mode cannot be switched while managed assets exist. Use the guided migration flow instead.",
          data: currentData,
        },
        { status: 409 },
      );
    }

    await saveStepThreeState(parsed);
    const data = await buildAdminStorageSettingsData({
      organizationId: auth.context.organizationId,
    });

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: "Invalid storage settings.", issues: error.issues },
        { status: 400 },
      );
    }

    const runtimeStorage = getRuntimeStorageSnapshot();
    if (!runtimeStorage.provider && runtimeStorage.error) {
      return NextResponse.json(
        {
          ok: false,
          error: `Storage runtime config is invalid: ${runtimeStorage.error}`,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { ok: false, error: "Failed to save storage settings." },
      { status: 500 },
    );
  }
}
