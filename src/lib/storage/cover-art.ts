import crypto from "node:crypto";
import path from "node:path";

import { getStorageAdapterFromEnv } from "@/lib/storage/adapter";
import { normalizeContentType, readIntegerEnv } from "@/lib/storage/upload-policy";

export const DEFAULT_MAX_COVER_UPLOAD_SIZE_BYTES = 25 * 1024 * 1024;

const ALLOWED_COVER_IMAGE_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
]);

export function readMaxCoverUploadSizeBytesFromEnv() {
  return readIntegerEnv(
    "MAX_COVER_UPLOAD_SIZE_BYTES",
    DEFAULT_MAX_COVER_UPLOAD_SIZE_BYTES,
  );
}

export function isAllowedCoverImageContentType(contentType: string) {
  return ALLOWED_COVER_IMAGE_CONTENT_TYPES.has(normalizeContentType(contentType));
}

function sanitizeFileName(fileName: string) {
  const base = path.basename(fileName.trim()).replace(/\s+/g, "-");
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, "");
  if (safe.length > 0) {
    return safe.slice(0, 140);
  }

  return "cover-image.bin";
}

export function buildCoverStorageKey(fileName: string) {
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  const safeName = sanitizeFileName(fileName);
  return `admin/covers/${year}/${month}/${day}/${crypto.randomUUID()}-${safeName}`;
}

export function isValidCoverStorageKey(storageKey: string) {
  const trimmed = storageKey.trim();
  if (trimmed.length === 0 || trimmed.length > 500) {
    return false;
  }

  if (!trimmed.startsWith("admin/covers/")) {
    return false;
  }

  if (trimmed.startsWith("/") || trimmed.includes("..")) {
    return false;
  }

  return /^[A-Za-z0-9/_\-.]+$/.test(trimmed);
}

export function resolveCoverImageUrlFromStorageKey(storageKey: string) {
  const storage = getStorageAdapterFromEnv();
  const publicUrl = storage.getPublicObjectUrl(storageKey);

  if (!publicUrl) {
    throw new Error(
      "STORAGE_PUBLIC_BASE_URL must be configured to publish cover artwork URLs.",
    );
  }

  return publicUrl;
}

export function extractStorageKeyFromCoverImageUrl(coverImageUrl: string | null) {
  if (!coverImageUrl || coverImageUrl.trim().length === 0) {
    return null;
  }

  const storage = getStorageAdapterFromEnv();
  if (!storage.publicBaseUrl) {
    return null;
  }

  try {
    const baseUrl = new URL(`${storage.publicBaseUrl}/`);
    const parsed = new URL(coverImageUrl);

    if (baseUrl.origin !== parsed.origin) {
      return null;
    }

    if (!parsed.pathname.startsWith(baseUrl.pathname)) {
      return null;
    }

    const rawPath = parsed.pathname.slice(baseUrl.pathname.length);
    const storageKey = decodeURIComponent(rawPath).replace(/^\/+/, "");

    return storageKey.length > 0 ? storageKey : null;
  } catch {
    return null;
  }
}
