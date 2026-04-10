import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

import { decryptSecret } from "@/lib/crypto/secret-box";
import { prisma } from "@/lib/prisma";
import {
  createStorageAdapter,
  getStorageAdapterFromEnv,
  type StorageAdapter,
  type StorageProvider,
} from "@/lib/storage/adapter";
import { extractStorageKeyFromCoverImageUrl } from "@/lib/storage/cover-art";
import { stepThreeSchema, type StepThreeInput } from "@/lib/setup/step-three";

const DEFAULT_GARAGE_ENDPOINT = "http://localhost:3900";
const DEFAULT_GARAGE_REGION = "us-east-1";
const DEFAULT_GARAGE_BUCKET = "media";
const DEFAULT_GARAGE_ACCESS_KEY_ID = "access-key-id";
const DEFAULT_GARAGE_SECRET_ACCESS_KEY = "secret-access-key";

export const adminStorageSettingsSchema = stepThreeSchema;

export type StorageAssetUsageSummary = {
  trackAssetCount: number;
  releaseFileCount: number;
  releaseCoverImageCount: number;
  artistImageCount: number;
  organizationLogoCount: number;
  managedImageObjectCount: number;
  totalReferencedObjects: number;
  hasAssets: boolean;
};

export type StorageMigrationObject = {
  storageKey: string;
  contentType: string | null;
};

export type RuntimeStorageSnapshot = {
  provider: StorageProvider | null;
  bucket: string | null;
  region: string | null;
  endpoint: string | null;
  error: string | null;
};

type ResolvedTargetStorage = {
  adapter: StorageAdapter;
  normalizedInput: StepThreeInput;
};

function trimToOptional(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function getHttpStatusCode(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "$metadata" in error &&
    typeof error.$metadata === "object" &&
    error.$metadata !== null &&
    "httpStatusCode" in error.$metadata &&
    typeof error.$metadata.httpStatusCode === "number"
  ) {
    return error.$metadata.httpStatusCode;
  }

  return null;
}

function addStorageObject(
  map: Map<string, StorageMigrationObject>,
  input: StorageMigrationObject,
) {
  const existing = map.get(input.storageKey);
  if (!existing) {
    map.set(input.storageKey, input);
    return;
  }

  if (!existing.contentType && input.contentType) {
    map.set(input.storageKey, input);
  }
}

function safeExtractStorageKeyFromCoverImageUrl(coverImageUrl: string | null) {
  try {
    return extractStorageKeyFromCoverImageUrl(coverImageUrl);
  } catch {
    return null;
  }
}

export async function listStorageMigrationObjects(input: {
  organizationId: string;
}) {
  const [trackAssets, releaseFiles, releases, artists, settings] = await Promise.all([
    prisma.trackAsset.findMany({
      where: {
        track: {
          release: {
            organizationId: input.organizationId,
          },
        },
      },
      select: {
        storageKey: true,
        mimeType: true,
      },
    }),
    prisma.releaseFile.findMany({
      where: {
        release: {
          organizationId: input.organizationId,
        },
      },
      select: {
        storageKey: true,
        mimeType: true,
      },
    }),
    prisma.release.findMany({
      where: {
        organizationId: input.organizationId,
        coverImageUrl: { not: null },
      },
      select: {
        coverImageUrl: true,
      },
    }),
    prisma.artist.findMany({
      where: {
        organizationId: input.organizationId,
        imageUrl: { not: null },
      },
      select: {
        imageUrl: true,
      },
    }),
    prisma.storeSettings.findFirst({
      where: { organizationId: input.organizationId },
      select: { organizationLogoUrl: true },
    }),
  ]);

  const migrationObjects = new Map<string, StorageMigrationObject>();

  for (const asset of trackAssets) {
    addStorageObject(migrationObjects, {
      storageKey: asset.storageKey,
      contentType: asset.mimeType,
    });
  }

  for (const releaseFile of releaseFiles) {
    addStorageObject(migrationObjects, {
      storageKey: releaseFile.storageKey,
      contentType: releaseFile.mimeType,
    });
  }

  for (const release of releases) {
    const storageKey = safeExtractStorageKeyFromCoverImageUrl(release.coverImageUrl);
    if (!storageKey) {
      continue;
    }
    addStorageObject(migrationObjects, {
      storageKey,
      contentType: null,
    });
  }

  for (const artist of artists) {
    const storageKey = safeExtractStorageKeyFromCoverImageUrl(artist.imageUrl);
    if (!storageKey) {
      continue;
    }
    addStorageObject(migrationObjects, {
      storageKey,
      contentType: null,
    });
  }

  const orgLogoStorageKey = safeExtractStorageKeyFromCoverImageUrl(
    settings?.organizationLogoUrl ?? null,
  );
  if (orgLogoStorageKey) {
    addStorageObject(migrationObjects, {
      storageKey: orgLogoStorageKey,
      contentType: null,
    });
  }

  const managedImageObjectCount =
    migrationObjects.size - trackAssets.length - releaseFiles.length;

  return {
    objects: Array.from(migrationObjects.values()),
    usage: {
      trackAssetCount: trackAssets.length,
      releaseFileCount: releaseFiles.length,
      releaseCoverImageCount: releases.length,
      artistImageCount: artists.length,
      organizationLogoCount: settings?.organizationLogoUrl ? 1 : 0,
      managedImageObjectCount: Math.max(0, managedImageObjectCount),
      totalReferencedObjects: migrationObjects.size,
      hasAssets: migrationObjects.size > 0,
    } satisfies StorageAssetUsageSummary,
  };
}

export function getRuntimeStorageSnapshot(): RuntimeStorageSnapshot {
  try {
    const storage = getStorageAdapterFromEnv();
    return {
      provider: storage.provider,
      bucket: storage.bucket,
      region: storage.region,
      endpoint: storage.endpoint ?? null,
      error: null,
    };
  } catch (error) {
    return {
      provider: null,
      bucket: null,
      region: null,
      endpoint: null,
      error: error instanceof Error ? error.message : "Storage runtime config is invalid.",
    };
  }
}

export function buildStorageMigrationConfirmation(totalObjects: number) {
  return `MIGRATE ${totalObjects} OBJECTS`;
}

export async function resolveStorageSecretAccessKey(input: {
  incomingSecretAccessKey: string | undefined;
}) {
  const incoming = trimToOptional(input.incomingSecretAccessKey);
  if (incoming) {
    return incoming;
  }

  const state = await prisma.setupWizardState.findUnique({
    where: { singletonKey: 1 },
    select: { storageSecretAccessKey: true },
  });

  return decryptSecret(state?.storageSecretAccessKey) ?? null;
}

export function resolveTargetStorage(input: {
  settings: StepThreeInput;
  secretAccessKey: string | null;
}): ResolvedTargetStorage {
  const storageMode = input.settings.storageMode;
  if (storageMode === "S3") {
    const endpoint = trimToOptional(input.settings.storageEndpoint);
    const region = trimToOptional(input.settings.storageRegion);
    const bucket = trimToOptional(input.settings.storageBucket);
    const accessKeyId = trimToOptional(input.settings.storageAccessKeyId);
    const secretAccessKey = trimToOptional(input.secretAccessKey ?? undefined);

    if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey) {
      throw new Error(
        "External S3 migration target must include endpoint, region, bucket, access key ID, and secret access key.",
      );
    }

    return {
      adapter: createStorageAdapter({
        provider: "S3",
        bucket,
        region,
        endpoint,
        usePathStyle: input.settings.storageUsePathStyle,
        accessKeyId,
        secretAccessKey,
      }),
      normalizedInput: {
        storageMode: "S3",
        storageEndpoint: endpoint,
        storageRegion: region,
        storageBucket: bucket,
        storageAccessKeyId: accessKeyId,
        storageSecretAccessKey: secretAccessKey,
        storageUsePathStyle: input.settings.storageUsePathStyle,
      },
    };
  }

  const endpoint =
    trimToOptional(process.env.STORAGE_ENDPOINT) ?? DEFAULT_GARAGE_ENDPOINT;
  const region = trimToOptional(process.env.STORAGE_REGION) ?? DEFAULT_GARAGE_REGION;
  const bucket = trimToOptional(process.env.STORAGE_BUCKET) ?? DEFAULT_GARAGE_BUCKET;
  const accessKeyId =
    trimToOptional(process.env.STORAGE_ACCESS_KEY_ID) ?? DEFAULT_GARAGE_ACCESS_KEY_ID;
  const secretAccessKey =
    trimToOptional(process.env.STORAGE_SECRET_ACCESS_KEY) ?? DEFAULT_GARAGE_SECRET_ACCESS_KEY;

  return {
    adapter: createStorageAdapter({
      provider: "GARAGE",
      bucket,
      region,
      endpoint,
      usePathStyle: true,
      accessKeyId,
      secretAccessKey,
    }),
    normalizedInput: {
      storageMode: "GARAGE",
      storageEndpoint: endpoint,
      storageRegion: region,
      storageBucket: bucket,
      storageAccessKeyId: accessKeyId,
      storageSecretAccessKey: secretAccessKey,
      storageUsePathStyle: true,
    },
  };
}

export async function ensureTargetBucketExists(adapter: StorageAdapter) {
  try {
    await adapter.getClient().send(new HeadBucketCommand({ Bucket: adapter.bucket }));
    return;
  } catch (error) {
    const statusCode = getHttpStatusCode(error);
    const notFound = statusCode === 404;

    if (!notFound) {
      throw error;
    }

    if (adapter.provider !== "GARAGE") {
      throw new Error(
        `Target storage bucket "${adapter.bucket}" was not found. Create it first, then retry migration.`,
      );
    }

    await adapter.getClient().send(new CreateBucketCommand({ Bucket: adapter.bucket }));
  }
}

export async function migrateStorageObjects(input: {
  source: StorageAdapter;
  target: StorageAdapter;
  objects: StorageMigrationObject[];
}) {
  const sameDestination =
    input.source.provider === input.target.provider &&
    input.source.bucket === input.target.bucket &&
    input.source.region === input.target.region &&
    (input.source.endpoint ?? "") === (input.target.endpoint ?? "");

  if (sameDestination) {
    throw new Error(
      "Source and target storage appear to be the same location. Choose a different target before running migration.",
    );
  }

  let copied = 0;

  for (const object of input.objects) {
    const sourceObject = await input.source
      .getClient()
      .send(
        new GetObjectCommand({
          Bucket: input.source.bucket,
          Key: object.storageKey,
        }),
      );

    if (!sourceObject.Body) {
      throw new Error(`Storage object "${object.storageKey}" is empty or unreadable.`);
    }

    await input.target
      .getClient()
      .send(
        new PutObjectCommand({
          Bucket: input.target.bucket,
          Key: object.storageKey,
          Body: sourceObject.Body,
          ContentType: object.contentType ?? sourceObject.ContentType ?? undefined,
        }),
      );

    copied += 1;
  }

  return { copied };
}
