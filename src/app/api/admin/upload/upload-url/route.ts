import crypto from "node:crypto";
import path from "node:path";

import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminRequestContext } from "@/lib/admin/request-context";
import { adminRateLimitPolicies } from "@/lib/security/admin-policies";
import { enforceCsrfProtection } from "@/lib/security/csrf";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { getStorageAdapterFromEnv } from "@/lib/storage/adapter";
import {
  isAllowedUploadContentType,
  normalizeContentType,
  readIntegerEnv,
  readMaxUploadSizeBytesFromEnv,
} from "@/lib/storage/upload-policy";

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
  provider: "MINIO" | "S3";
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

    if (input.provider !== "MINIO") {
      throw new Error(
        `Storage bucket "${input.bucket}" was not found. Create it first and try again.`,
      );
    }

    await client.send(new CreateBucketCommand({ Bucket: input.bucket }));
  }
}

function sanitizeFileName(fileName: string) {
  const base = path.basename(fileName.trim()).replace(/\s+/g, "-");
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, "");
  if (safe.length > 0) {
    return safe.slice(0, 140);
  }

  return "upload.bin";
}

function buildStorageKey(fileName: string) {
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  const safeName = sanitizeFileName(fileName);
  return `admin/uploads/${year}/${month}/${day}/${crypto.randomUUID()}-${safeName}`;
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
    {
      key: `admin-session:${auth.context.session.userId}:${auth.context.session.expiresAt}`,
    },
  );
  if (sessionScopedRateLimitError) {
    return sessionScopedRateLimitError;
  }

  try {
    const payload = await request.json();
    const parsed = uploadRequestSchema.parse(payload);

    const maxUploadSizeBytes = readMaxUploadSizeBytesFromEnv();
    const normalizedContentType = normalizeContentType(parsed.contentType);

    if (parsed.sizeBytes > maxUploadSizeBytes) {
      return NextResponse.json(
        {
          ok: false,
          error: `File exceeds upload limit of ${maxUploadSizeBytes} bytes.`,
        },
        { status: 413 },
      );
    }

    if (!isAllowedUploadContentType(normalizedContentType)) {
      return NextResponse.json(
        {
          ok: false,
          error: `Unsupported content type "${parsed.contentType}".`,
        },
        { status: 415 },
      );
    }

    const storageKey = buildStorageKey(parsed.fileName);
    const storage = getStorageAdapterFromEnv();
    await ensureBucketExists({
      provider: storage.provider,
      bucket: storage.bucket,
      client: storage.getClient,
    });
    const expiresInSeconds = Math.min(
      readIntegerEnv(
        "SIGNED_URL_EXPIRY_SECONDS",
        DEFAULT_PRESIGNED_URL_EXPIRY_SECONDS,
      ),
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
      uploadUrl,
      maxUploadSizeBytes,
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
          error: "Invalid upload request. Provide fileName, contentType, and sizeBytes.",
        },
        { status: 400 },
      );
    }

    if (error instanceof Error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { ok: false, error: "Could not generate an upload URL." },
      { status: 500 },
    );
  }
}
