import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminRequestContext } from "@/lib/admin/request-context";
import {
  adminStorageSettingsSchema,
  buildStorageMigrationConfirmation,
  ensureTargetBucketExists,
  getRuntimeStorageSnapshot,
  listStorageMigrationObjects,
  migrateStorageObjects,
  resolveStorageSecretAccessKey,
  resolveTargetStorage,
} from "@/lib/admin/storage-management";
import { enforceCsrfProtection } from "@/lib/security/csrf";
import { prisma } from "@/lib/prisma";
import { getStorageAdapterFromEnv } from "@/lib/storage/adapter";
import { saveStepThreeState, validateExternalS3Credentials } from "@/lib/setup/step-three";
import { buildAdminStorageSettingsData } from "../storage-response";

export const runtime = "nodejs";

const migrateStorageSchema = adminStorageSettingsSchema.safeExtend({
  confirmation: z.string().trim().min(1, "Migration confirmation text is required."),
});

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
    const parsed = migrateStorageSchema.parse(payload);

    const runtimeStorage = getRuntimeStorageSnapshot();
    if (!runtimeStorage.provider) {
      throw new Error(
        runtimeStorage.error ??
          "Storage runtime config is invalid. Fix env storage settings before migration.",
      );
    }

    const { objects, usage } = await listStorageMigrationObjects({
      organizationId: auth.context.organizationId,
    });

    if (!usage.hasAssets || usage.totalReferencedObjects === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No managed storage objects were found. Save the new storage settings directly; migration is not required.",
        },
        { status: 400 },
      );
    }

    if (parsed.storageMode === runtimeStorage.provider) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Target storage mode matches the current runtime storage mode. Choose the opposite mode to migrate.",
        },
        { status: 400 },
      );
    }

    const requiredConfirmation = buildStorageMigrationConfirmation(
      usage.totalReferencedObjects,
    );
    if (parsed.confirmation !== requiredConfirmation) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Migration confirmation text does not match. Review the required text and retry.",
          requiredConfirmation,
        },
        { status: 400 },
      );
    }

    const secretAccessKey = await resolveStorageSecretAccessKey({
      incomingSecretAccessKey: parsed.storageSecretAccessKey,
    });
    const resolvedTarget = resolveTargetStorage({
      settings: parsed,
      secretAccessKey,
    });

    const sourceAdapter = getStorageAdapterFromEnv();

    await ensureTargetBucketExists(resolvedTarget.adapter);
    await resolvedTarget.adapter.validateAccess();

    const startedAt = new Date();
    const migration = await migrateStorageObjects({
      source: sourceAdapter,
      target: resolvedTarget.adapter,
      objects,
    });

    await saveStepThreeState(resolvedTarget.normalizedInput);
    let validationMessage: string | null = null;
    if (resolvedTarget.normalizedInput.storageMode === "S3") {
      const validation = await validateExternalS3Credentials();
      validationMessage = validation.message;
    }

    const finishedAt = new Date();
    const runtimeSwitchPending =
      sourceAdapter.provider !== resolvedTarget.adapter.provider;
    const migrationMessage =
      validationMessage ??
      `Copied ${migration.copied} storage objects to the ${resolvedTarget.adapter.provider} target.`;

    await prisma.storageMigrationRun.create({
      data: {
        organizationId: auth.context.organizationId,
        initiatedByUserId: auth.context.session.userId,
        status: "SUCCEEDED",
        sourceProvider: sourceAdapter.provider,
        targetProvider: resolvedTarget.adapter.provider,
        runtimeSwitchPending,
        totalObjects: usage.totalReferencedObjects,
        copiedObjects: migration.copied,
        message: migrationMessage,
        startedAt,
        finishedAt,
      },
    });

    const data = await buildAdminStorageSettingsData({
      organizationId: auth.context.organizationId,
    });

    return NextResponse.json({
      ok: true,
      data,
      migration: {
        copiedObjects: migration.copied,
        totalObjects: usage.totalReferencedObjects,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        message: migrationMessage,
        runtimeProvider: sourceAdapter.provider,
        targetProvider: resolvedTarget.adapter.provider,
        runtimeSwitchPending,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: "Invalid storage migration request.", issues: error.issues },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Storage migration failed.",
      },
      { status: 400 },
    );
  }
}
