import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";

export type StorageProvider = "MINIO" | "S3";

export type S3ConnectionConfig = {
  region: string;
  endpoint?: string;
  usePathStyle: boolean;
  accessKeyId: string;
  secretAccessKey: string;
};

export type StorageAdapter = {
  provider: StorageProvider;
  bucket: string;
  region: string;
  endpoint?: string;
  usePathStyle: boolean;
  publicBaseUrl: string | null;
  getClient: () => S3Client;
  validateAccess: () => Promise<void>;
  getPublicObjectUrl: (storageKey: string) => string | null;
};

type EnvStorageConfig = {
  provider: StorageProvider;
  bucket: string;
  region: string;
  endpoint?: string;
  usePathStyle: boolean;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string | null;
};

function readEnv(name: string) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function readBooleanEnv(name: string, fallback: boolean) {
  const value = readEnv(name);
  if (!value) {
    return fallback;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return fallback;
}

function getStorageProviderFromEnv(): StorageProvider {
  const storageMode = readEnv("STORAGE_MODE");
  if (storageMode === "MINIO" || storageMode === "S3") {
    return storageMode;
  }

  const minioEnabled = readEnv("MINIO_ENABLED");
  if (minioEnabled === "false") {
    return "S3";
  }

  return "MINIO";
}

function getRequiredEnv(name: string) {
  const value = readEnv(name);
  if (!value) {
    throw new Error(`${name} is required for external S3 storage mode.`);
  }

  return value;
}

function normalizePublicBaseUrl() {
  const value = readEnv("STORAGE_PUBLIC_BASE_URL");
  if (!value) {
    return null;
  }

  return value.replace(/\/+$/, "");
}

function readStorageConfigFromEnv(): EnvStorageConfig {
  const provider = getStorageProviderFromEnv();

  if (provider === "MINIO") {
    return {
      provider,
      bucket: readEnv("STORAGE_BUCKET") ?? "media",
      region: readEnv("STORAGE_REGION") ?? "us-east-1",
      endpoint: readEnv("STORAGE_ENDPOINT") ?? "http://localhost:9000",
      usePathStyle: readBooleanEnv("STORAGE_USE_PATH_STYLE", true),
      accessKeyId: readEnv("STORAGE_ACCESS_KEY_ID") ?? "minioadmin",
      secretAccessKey: readEnv("STORAGE_SECRET_ACCESS_KEY") ?? "minioadmin",
      publicBaseUrl: normalizePublicBaseUrl(),
    };
  }

  return {
    provider,
    bucket: getRequiredEnv("STORAGE_BUCKET"),
    region: getRequiredEnv("STORAGE_REGION"),
    endpoint: readEnv("STORAGE_ENDPOINT"),
    usePathStyle: readBooleanEnv("STORAGE_USE_PATH_STYLE", false),
    accessKeyId: getRequiredEnv("STORAGE_ACCESS_KEY_ID"),
    secretAccessKey: getRequiredEnv("STORAGE_SECRET_ACCESS_KEY"),
    publicBaseUrl: normalizePublicBaseUrl(),
  };
}

export function createS3Client(config: S3ConnectionConfig) {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.usePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

export function createStorageAdapter(config: {
  provider: StorageProvider;
  bucket: string;
  region: string;
  endpoint?: string;
  usePathStyle: boolean;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl?: string | null;
}): StorageAdapter {
  const client = createS3Client({
    region: config.region,
    endpoint: config.endpoint,
    usePathStyle: config.usePathStyle,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  });
  const publicBaseUrl = config.publicBaseUrl?.replace(/\/+$/, "") ?? null;

  return {
    provider: config.provider,
    bucket: config.bucket,
    region: config.region,
    endpoint: config.endpoint,
    usePathStyle: config.usePathStyle,
    publicBaseUrl,
    getClient: () => client,
    validateAccess: async () => {
      await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
    },
    getPublicObjectUrl: (storageKey: string) => {
      if (!publicBaseUrl) {
        return null;
      }

      try {
        const base = `${publicBaseUrl}/`;
        return new URL(storageKey, base).toString();
      } catch {
        return null;
      }
    },
  };
}

export function getStorageAdapterFromEnv() {
  const config = readStorageConfigFromEnv();
  return createStorageAdapter(config);
}
