import { PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3";

import type { StorageProvider } from "@/lib/storage/adapter";

const garageCorsCache = new Set<string>();

function normalizeOrigin(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function resolveAllowedOrigins(requestOrigin: string | null | undefined) {
  const origins = new Set<string>();
  const fromRequest = normalizeOrigin(requestOrigin);
  if (fromRequest) {
    origins.add(fromRequest);
  }

  const fromAppBaseUrl = normalizeOrigin(process.env.APP_BASE_URL);
  if (fromAppBaseUrl) {
    origins.add(fromAppBaseUrl);
  }

  return Array.from(origins);
}

export async function ensureGarageBucketCors(input: {
  provider: StorageProvider;
  bucket: string;
  client: () => S3Client;
  requestOrigin?: string | null;
}) {
  if (input.provider !== "GARAGE") {
    return;
  }

  const allowedOrigins = resolveAllowedOrigins(input.requestOrigin);
  if (allowedOrigins.length === 0) {
    return;
  }

  const cacheKey = `${input.bucket}:${allowedOrigins.sort().join(",")}`;
  if (garageCorsCache.has(cacheKey)) {
    return;
  }

  await input.client().send(
    new PutBucketCorsCommand({
      Bucket: input.bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedHeaders: ["*"],
            AllowedMethods: ["GET", "HEAD", "PUT"],
            AllowedOrigins: allowedOrigins,
            ExposeHeaders: ["ETag"],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }),
  );

  garageCorsCache.add(cacheKey);
}
