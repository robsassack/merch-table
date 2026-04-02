import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import type { Prisma } from "@/generated/prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getStorageAdapterFromEnv } from "@/lib/storage/adapter";

export function errorResponse(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

export function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

export function isForeignKeyConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2003"
  );
}

export function parseDateInputValue(dateInput: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    return null;
  }

  const [yearText, monthText, dayText] = dateInput.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }

  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed;
}

function uniqueTrimmedStrings(values: string[]) {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter((value) => value.length > 0)),
  );
}

function getStorageHttpStatusCode(error: unknown) {
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

function isMissingStorageObjectError(error: unknown) {
  const statusCode = getStorageHttpStatusCode(error);
  if (statusCode === 404) {
    return true;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    typeof error.name === "string"
  ) {
    return error.name === "NoSuchKey" || error.name === "NotFound";
  }

  return false;
}

async function markTranscodeJobFailed(jobId: string, errorMessage: string) {
  await prisma.transcodeJob
    .update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        errorMessage,
        finishedAt: new Date(),
      },
    })
    .catch(() => undefined);
}

export async function enqueueJobIds(input: {
  jobIds: string[];
  enqueue: (jobId: string) => Promise<unknown>;
  failureMessage: string;
  onEnqueueError?: () => void;
}) {
  let queuedCount = 0;
  for (const jobId of input.jobIds) {
    try {
      await input.enqueue(jobId);
      queuedCount += 1;
    } catch {
      input.onEnqueueError?.();
      await markTranscodeJobFailed(jobId, input.failureMessage);
    }
  }

  return queuedCount;
}

export async function refreshReleaseForResponse<TSelect extends Prisma.ReleaseSelect>(input: {
  releaseId: string;
  organizationId: string;
  releaseSelect: TSelect;
  notFoundMessage: string;
}) {
  const refreshed = await prisma.release.findFirst({
    where: {
      id: input.releaseId,
      organizationId: input.organizationId,
    },
    select: input.releaseSelect,
  });

  if (!refreshed) {
    return {
      response: errorResponse(input.notFoundMessage, 404),
    };
  }

  return {
    release: refreshed,
  };
}

export async function purgeStorageObjects(storageKeys: string[]) {
  const uniqueKeys = uniqueTrimmedStrings(storageKeys);
  if (uniqueKeys.length === 0) {
    return 0;
  }

  const storage = getStorageAdapterFromEnv();
  const client = storage.getClient();

  const failedKeys: string[] = [];
  for (const key of uniqueKeys) {
    try {
      await client.send(
        new DeleteObjectCommand({
          Bucket: storage.bucket,
          Key: key,
        }),
      );
    } catch (error) {
      if (isMissingStorageObjectError(error)) {
        continue;
      }

      failedKeys.push(key);
    }
  }

  if (failedKeys.length > 0) {
    throw new Error(
      `Could not delete ${failedKeys.length} storage asset${failedKeys.length === 1 ? "" : "s"}.`,
    );
  }

  return uniqueKeys.length;
}
