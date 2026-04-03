import os from "node:os";
import path from "node:path";

import type { DeliveryFormat } from "@/generated/prisma/enums";

export const DEFAULT_PREVIEW_SECONDS = 30;
export const DEFAULT_SOURCE_ROOT = path.join(os.tmpdir(), "merch-table", "source");
export const DEFAULT_OUTPUT_ROOT = path.join(os.tmpdir(), "merch-table", "output");
export const DEFAULT_RELEASE_DELIVERY_FORMATS: DeliveryFormat[] = ["MP3", "M4A", "FLAC"];
export const DEFAULT_STALE_QUEUED_RECOVERY_BATCH_SIZE = 25;
export const DEFAULT_STALE_RUNNING_RECOVERY_BATCH_SIZE = 25;
export const DEFAULT_RETRY_ENQUEUE_BATCH_SIZE = 25;
export const DEFAULT_RETRY_ENQUEUE_FAILURE_DELAY_MS = 10_000;
export const DEFAULT_TRANSIENT_RETRY_MAX_ATTEMPTS = 4;
export const DEFAULT_TRANSIENT_RETRY_BASE_DELAY_SECONDS = 5;
export const DEFAULT_TRANSIENT_RETRY_MAX_DELAY_SECONDS = 120;
export const DEFAULT_FFMPEG_TIMEOUT_SECONDS = 15 * 60;

const TRANSIENT_NODE_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ECONNABORTED",
  "EPIPE",
  "ETIMEDOUT",
  "ESOCKETTIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EAI_AGAIN",
]);

const TRANSIENT_MESSAGE_PATTERNS = [
  "temporarily unavailable",
  "resource temporarily unavailable",
  "connection reset",
  "connection refused",
  "timed out",
  "timeout",
  "network is unreachable",
  "no route to host",
  "broken pipe",
  "service unavailable",
  "bad gateway",
  "gateway timeout",
  "too many requests",
  "try again",
];

function readPositiveIntegerFromEnv(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

export function readDirectoryFromEnv(name: string, fallback: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    return fallback;
  }

  return path.resolve(value);
}

export function readPositiveIntegerSecondsFromEnv(name: string, fallback: number) {
  return readPositiveIntegerFromEnv(name, fallback);
}

export function readTransientRetryPolicyFromEnv() {
  const maxAttempts = Math.max(
    1,
    readPositiveIntegerFromEnv(
      "TRANSCODE_TRANSIENT_RETRY_MAX_ATTEMPTS",
      DEFAULT_TRANSIENT_RETRY_MAX_ATTEMPTS,
    ),
  );
  const baseDelayMs =
    Math.max(
      1,
      readPositiveIntegerFromEnv(
        "TRANSCODE_TRANSIENT_RETRY_BASE_DELAY_SECONDS",
        DEFAULT_TRANSIENT_RETRY_BASE_DELAY_SECONDS,
      ),
    ) * 1_000;
  const maxDelayMs =
    Math.max(
      1,
      readPositiveIntegerFromEnv(
        "TRANSCODE_TRANSIENT_RETRY_MAX_DELAY_SECONDS",
        DEFAULT_TRANSIENT_RETRY_MAX_DELAY_SECONDS,
      ),
    ) * 1_000;

  return {
    maxAttempts,
    baseDelayMs,
    maxDelayMs: Math.max(baseDelayMs, maxDelayMs),
  } as const;
}

export function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message.slice(0, 1_000);
  }

  return "Unknown transcode worker error.";
}

export function truncateFailureReason(reason: string) {
  return reason.slice(0, 1_000);
}

function extractErrorCode(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }

  return null;
}

function extractErrorName(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    typeof error.name === "string"
  ) {
    return error.name;
  }

  return null;
}

function extractHttpStatusCode(error: unknown) {
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

function extractErrorDetailText(error: unknown) {
  let detail = "";

  if (error instanceof Error) {
    detail = error.message;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "stderr" in error &&
    typeof error.stderr === "string" &&
    error.stderr.trim().length > 0
  ) {
    detail = `${detail} ${error.stderr}`.trim();
  }

  return detail.toLowerCase();
}

export function isTransientTranscodeError(error: unknown) {
  const errorCode = extractErrorCode(error);
  if (errorCode && TRANSIENT_NODE_ERROR_CODES.has(errorCode.toUpperCase())) {
    return true;
  }

  const httpStatusCode = extractHttpStatusCode(error);
  if (
    httpStatusCode !== null &&
    [408, 425, 429, 500, 502, 503, 504].includes(httpStatusCode)
  ) {
    return true;
  }

  const errorName = extractErrorName(error)?.toLowerCase() ?? "";
  if (
    errorName.includes("timeout") ||
    errorName.includes("throttle") ||
    errorName.includes("network")
  ) {
    return true;
  }

  const detail = extractErrorDetailText(error);
  if (TRANSIENT_MESSAGE_PATTERNS.some((pattern) => detail.includes(pattern))) {
    return true;
  }

  return false;
}

export function resolveRetryBackoffDelayMs(input: {
  attemptCount: number;
  baseDelayMs: number;
  maxDelayMs: number;
}) {
  const exponent = Math.max(0, input.attemptCount - 1);
  const rawDelayMs = Math.min(
    input.maxDelayMs,
    input.baseDelayMs * Math.pow(2, exponent),
  );
  const jitterFactor = 0.85 + Math.random() * 0.3;
  return Math.max(1_000, Math.round(rawDelayMs * jitterFactor));
}

export function resolveEffectiveDeliveryFormats(formats: DeliveryFormat[]) {
  return formats.length > 0 ? formats : DEFAULT_RELEASE_DELIVERY_FORMATS;
}

export function resolveSourceExtension(input: { format: string; storageKey: string }) {
  const format = input.format.trim().toLowerCase();
  if (format.length > 0 && /^[a-z0-9]+$/.test(format)) {
    return format;
  }

  const fromKey = path.extname(input.storageKey).toLowerCase().replace(".", "");
  if (fromKey.length > 0) {
    return fromKey;
  }

  return "bin";
}
