import { CreateBucketCommand, HeadBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminRequestContext } from "@/lib/admin/request-context";
import { adminRateLimitPolicies } from "@/lib/security/admin-policies";
import { enforceCsrfProtection } from "@/lib/security/csrf";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { getStorageAdapterFromEnv } from "@/lib/storage/adapter";
import { ensureGarageBucketCors } from "@/lib/storage/cors";
import {
  buildCoverStorageKey,
  isAllowedCoverImageContentType,
  readMaxCoverUploadSizeBytesFromEnv,
  resolveCoverImageUrlFromStorageKey,
} from "@/lib/storage/cover-art";
import { normalizeContentType, readIntegerEnv } from "@/lib/storage/upload-policy";

export const runtime = "nodejs";

const uploadRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(255),
  sizeBytes: z.number().int().positive(),
});

const DEFAULT_PRESIGNED_URL_EXPIRY_SECONDS = 15 * 60;
const MAX_PRESIGNED_URL_EXPIRY_SECONDS = 7 * 24 * 60 * 60;

function getHttpStatusCode(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "$metadata" in error &&
    typeof error.$metadata === "object" &&
    error.$metadata !== null &&
    "httpStatusCode" in error.$metadata
  ) {
    const statusCode = error.$metadata.httpStatusCode;
    if (typeof statusCode === "number") {
      return statusCode;
    }
  }

  return null;
}

async function ensureBucketExists(input: {
  provider: "GARAGE" | "S3";
  bucket: string;
  client: ReturnType<typeof getStorageAdapterFromEnv>["getClient"];
}) {
  const client = input.client();

  try {
    await client.send(new HeadBucketCommand({ Bucket: input.bucket }));
    return;
  } catch (error) {
    const statusCode = getHttpStatusCode(error);
    const notFound = statusCode === 404;

    if (!notFound) {
      throw error;
    }

    if (input.provider !== "GARAGE") {
      throw new Error(
        `Storage bucket "${input.bucket}" was not found. Create it first and try again.`,
      );
    }

    await client.send(new CreateBucketCommand({ Bucket: input.bucket }));
  }
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

  const sessionScopedRateLimitError = await enforceRateLimit(
    request,
    adminRateLimitPolicies.uploadUrl,
    { key: `admin-session:${auth.context.session.userId}:${auth.context.session.expiresAt}` },
  );
  if (sessionScopedRateLimitError) {
    return sessionScopedRateLimitError;
  }

  try {
    const payload = await request.json();
    const parsed = uploadRequestSchema.parse(payload);

    const maxCoverUploadSizeBytes = readMaxCoverUploadSizeBytesFromEnv();
    const normalizedContentType = normalizeContentType(parsed.contentType);

    if (parsed.sizeBytes > maxCoverUploadSizeBytes) {
      return NextResponse.json(
        {
          ok: false,
          error: `File exceeds cover upload limit of ${maxCoverUploadSizeBytes} bytes.`,
        },
        { status: 413 },
      );
    }

    if (!isAllowedCoverImageContentType(normalizedContentType)) {
      return NextResponse.json(
        {
          ok: false,
          error: `Unsupported cover image content type "${parsed.contentType}".`,
        },
        { status: 415 },
      );
    }

    const storageKey = buildCoverStorageKey(parsed.fileName);
    const publicUrl = resolveCoverImageUrlFromStorageKey(storageKey);

    const storage = getStorageAdapterFromEnv();
    await ensureBucketExists({
      provider: storage.provider,
      bucket: storage.bucket,
      client: storage.getClient,
    });
    await ensureGarageBucketCors({
      provider: storage.provider,
      bucket: storage.bucket,
      client: storage.getClient,
      requestOrigin: request.headers.get("origin"),
    });

    const expiresInSeconds = Math.min(
      readIntegerEnv("SIGNED_URL_EXPIRY_SECONDS", DEFAULT_PRESIGNED_URL_EXPIRY_SECONDS),
      MAX_PRESIGNED_URL_EXPIRY_SECONDS,
    );

    const uploadUrl = await getSignedUrl(
      storage.getClient(),
      new PutObjectCommand({
        Bucket: storage.bucket,
        Key: storageKey,
        ContentType: normalizedContentType,
        ContentLength: parsed.sizeBytes,
      }),
      { expiresIn: expiresInSeconds },
    );

    return NextResponse.json({
      ok: true,
      storageProvider: storage.provider,
      bucket: storage.bucket,
      storageKey,
      publicUrl,
      uploadUrl,
      maxCoverUploadSizeBytes,
      expiresInSeconds,
      requiredHeaders: {
        "content-type": normalizedContentType,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Invalid cover upload request. Provide fileName, contentType, and sizeBytes.",
        },
        { status: 400 },
      );
    }

    if (error instanceof Error) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { ok: false, error: "Could not generate a cover upload URL." },
      { status: 500 },
    );
  }
}
