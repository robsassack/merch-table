import { z } from "zod";

import { decryptSecret, encryptSecret } from "@/lib/crypto/secret-box";
import { prisma } from "@/lib/prisma";
import { createStorageAdapter } from "@/lib/storage/adapter";

const storageModeEnum = z.enum(["GARAGE", "S3"]);

export const stepThreeSchema = z
  .object({
    storageMode: storageModeEnum.default("GARAGE"),
    storageEndpoint: z.string().trim().max(512).optional(),
    storageRegion: z.string().trim().max(255).optional(),
    storageBucket: z.string().trim().max(255).optional(),
    storageAccessKeyId: z.string().trim().max(255).optional(),
    storageSecretAccessKey: z.string().trim().max(255).optional(),
    storageUsePathStyle: z.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    if (value.storageMode === "GARAGE") {
      return;
    }

    if (!value.storageEndpoint || value.storageEndpoint.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "S3 endpoint is required for external S3.",
        path: ["storageEndpoint"],
      });
    }

    if (!value.storageRegion || value.storageRegion.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "S3 region is required for external S3.",
        path: ["storageRegion"],
      });
    }

    if (!value.storageBucket || value.storageBucket.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "S3 bucket is required for external S3.",
        path: ["storageBucket"],
      });
    }

    if (!value.storageAccessKeyId || value.storageAccessKeyId.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "S3 access key ID is required for external S3.",
        path: ["storageAccessKeyId"],
      });
    }
  });

export type StepThreeInput = z.infer<typeof stepThreeSchema>;

export type StepThreeState = {
  storageMode: "GARAGE" | "S3";
  storageEndpoint: string;
  storageRegion: string;
  storageBucket: string;
  storageAccessKeyId: string;
  storageUsePathStyle: boolean;
  hasSecretAccessKey: boolean;
  validated: boolean;
  validatedAt: string | null;
  lastError: string | null;
};

const defaultState: StepThreeState = {
  storageMode: "GARAGE",
  storageEndpoint: process.env.STORAGE_ENDPOINT ?? "",
  storageRegion: process.env.STORAGE_REGION ?? "us-east-1",
  storageBucket: process.env.STORAGE_BUCKET ?? "media",
  storageAccessKeyId: process.env.STORAGE_ACCESS_KEY_ID ?? "",
  storageUsePathStyle: (process.env.STORAGE_USE_PATH_STYLE ?? "true") === "true",
  hasSecretAccessKey: false,
  validated: true,
  validatedAt: null,
  lastError: null,
};

export async function getStepThreeState(): Promise<StepThreeState> {
  const state = await prisma.setupWizardState.findUnique({
    where: { singletonKey: 1 },
    select: {
      storageMode: true,
      storageEndpoint: true,
      storageRegion: true,
      storageBucket: true,
      storageAccessKeyId: true,
      storageSecretAccessKey: true,
      storageUsePathStyle: true,
      storageValidatedAt: true,
      storageLastError: true,
    },
  });

  if (!state) {
    return defaultState;
  }

  const storageMode = (state.storageMode === "S3" ? "S3" : "GARAGE") as
    | "GARAGE"
    | "S3";
  const validated = storageMode === "GARAGE" ? true : Boolean(state.storageValidatedAt);

  return {
    storageMode,
    storageEndpoint: state.storageEndpoint ?? defaultState.storageEndpoint,
    storageRegion: state.storageRegion ?? defaultState.storageRegion,
    storageBucket: state.storageBucket ?? defaultState.storageBucket,
    storageAccessKeyId: state.storageAccessKeyId ?? defaultState.storageAccessKeyId,
    storageUsePathStyle: state.storageUsePathStyle,
    hasSecretAccessKey: Boolean(state.storageSecretAccessKey),
    validated,
    validatedAt: state.storageValidatedAt?.toISOString() ?? null,
    lastError: state.storageLastError ?? null,
  };
}

export async function saveStepThreeState(input: StepThreeInput) {
  const parsed = stepThreeSchema.parse(input);
  const existing = await prisma.setupWizardState.findUnique({
    where: { singletonKey: 1 },
    select: { storageSecretAccessKey: true },
  });

  const nextSecret =
    parsed.storageSecretAccessKey && parsed.storageSecretAccessKey.length > 0
      ? parsed.storageSecretAccessKey
      : decryptSecret(existing?.storageSecretAccessKey) ?? null;

  const validationData =
    parsed.storageMode === "GARAGE"
      ? {
          storageValidatedAt: new Date(),
          storageLastError: null,
        }
      : {
          storageValidatedAt: null,
          storageLastError: null,
        };

  await prisma.setupWizardState.upsert({
    where: { singletonKey: 1 },
    create: {
      singletonKey: 1,
      storageMode: parsed.storageMode,
      storageEndpoint: parsed.storageEndpoint ?? null,
      storageRegion: parsed.storageRegion ?? null,
      storageBucket: parsed.storageBucket ?? null,
      storageAccessKeyId: parsed.storageAccessKeyId ?? null,
      storageSecretAccessKey: encryptSecret(nextSecret),
      storageUsePathStyle: parsed.storageUsePathStyle,
      ...validationData,
    },
    update: {
      storageMode: parsed.storageMode,
      storageEndpoint: parsed.storageEndpoint ?? null,
      storageRegion: parsed.storageRegion ?? null,
      storageBucket: parsed.storageBucket ?? null,
      storageAccessKeyId: parsed.storageAccessKeyId ?? null,
      storageSecretAccessKey: encryptSecret(nextSecret),
      storageUsePathStyle: parsed.storageUsePathStyle,
      ...validationData,
    },
  });

  return getStepThreeState();
}

export async function validateExternalS3Credentials() {
  const state = await prisma.setupWizardState.findUnique({
    where: { singletonKey: 1 },
    select: {
      id: true,
      storageMode: true,
      storageEndpoint: true,
      storageRegion: true,
      storageBucket: true,
      storageAccessKeyId: true,
      storageSecretAccessKey: true,
      storageUsePathStyle: true,
    },
  });

  if (!state) {
    throw new Error("Save storage settings before validation.");
  }

  if (state.storageMode !== "S3") {
    const now = new Date();
    await prisma.setupWizardState.update({
      where: { id: state.id },
      data: {
        storageValidatedAt: now,
        storageLastError: null,
      },
    });

    return {
      validatedAt: now.toISOString(),
      message: "Bundled Garage selected. Validation is complete.",
    };
  }

  if (
    !state.storageEndpoint ||
    !state.storageRegion ||
    !state.storageBucket ||
    !state.storageAccessKeyId ||
    !state.storageSecretAccessKey
  ) {
    throw new Error("External S3 settings are incomplete.");
  }

  const storageSecretAccessKey = decryptSecret(state.storageSecretAccessKey);
  if (!storageSecretAccessKey) {
    throw new Error("External S3 settings are incomplete.");
  }

  const adapter = createStorageAdapter({
    provider: "S3",
    bucket: state.storageBucket,
    region: state.storageRegion,
    endpoint: state.storageEndpoint,
    usePathStyle: state.storageUsePathStyle,
    accessKeyId: state.storageAccessKeyId,
    secretAccessKey: storageSecretAccessKey,
  });

  await adapter.validateAccess();

  const now = new Date();
  await prisma.setupWizardState.update({
    where: { id: state.id },
    data: {
      storageValidatedAt: now,
      storageLastError: null,
    },
  });

  return {
    validatedAt: now.toISOString(),
    message: `Connected to bucket "${state.storageBucket}".`,
  };
}

export async function markStorageValidationFailed(errorMessage: string) {
  await prisma.setupWizardState.updateMany({
    where: { singletonKey: 1 },
    data: {
      storageValidatedAt: null,
      storageLastError: errorMessage,
    },
  });
}

export function isStepThreeComplete(state: StepThreeState) {
  if (state.storageMode === "GARAGE") {
    return true;
  }

  return state.validated && state.hasSecretAccessKey;
}
