import path from "node:path";

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";

import { logEvent } from "@/lib/logging";
import { prisma } from "@/lib/prisma";
import { libraryRateLimitPolicies } from "@/lib/security/library-policies";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { getStorageAdapterFromEnv } from "@/lib/storage/adapter";
import { readIntegerEnv } from "@/lib/storage/upload-policy";

export const runtime = "nodejs";

const DEFAULT_SIGNED_URL_EXPIRY_SECONDS = 15 * 60;
const MAX_SIGNED_URL_EXPIRY_SECONDS = 7 * 24 * 60 * 60;

type RouteContext = {
  params: Promise<{ entitlementToken: string; releaseFileId: string }>;
};

function isExpired(expiresAt: Date | null, now: Date) {
  return Boolean(expiresAt && expiresAt.getTime() <= now.getTime());
}

function sanitizeFileName(value: string) {
  const cleaned = value.replace(/["\\\r\n]/g, "_").trim();
  return cleaned.slice(0, 180);
}

function resolveDownloadFileName(input: { artistName: string; fileName: string }) {
  const baseName = path.basename(input.fileName.trim()) || "download.bin";

  const extension = path.extname(baseName);
  const stem = baseName.slice(0, Math.max(0, baseName.length - extension.length)).trim();

  // New naming convention: "01 - Track Artist - Track Title.ext".
  // Legacy naming convention: "01 - Track Title.ext".
  const prefixedStemMatch = stem.match(/^\d+\s*-\s*(.+)$/);
  if (prefixedStemMatch) {
    const payload = prefixedStemMatch[1]?.trim() ?? "";
    const hasArtistPrefix = payload.includes(" - ");
    const artistAndTitle = hasArtistPrefix
      ? payload
      : `${input.artistName.trim()} - ${payload}`;
    const withResolvedArtist = `${artistAndTitle}${extension}`;
    const sanitizedResolved = sanitizeFileName(withResolvedArtist);
    if (sanitizedResolved.length > 0) {
      return sanitizedResolved;
    }
  }

  const sanitized = sanitizeFileName(baseName);
  if (sanitized.length > 0) {
    return sanitized;
  }

  return "download.bin";
}

export async function GET(request: Request, context: RouteContext) {
  const rateLimitError = await enforceRateLimit(
    request,
    libraryRateLimitPolicies.download,
  );
  if (rateLimitError) {
    return rateLimitError;
  }

  const { entitlementToken, releaseFileId } = await context.params;
  if (!entitlementToken || !releaseFileId) {
    return NextResponse.json(
      { ok: false, error: "Entitlement token and release file id are required." },
      { status: 400 },
    );
  }

  const entitlement = await prisma.downloadEntitlement.findUnique({
    where: { token: entitlementToken },
    select: {
      releaseFileId: true,
      expiresAt: true,
      releaseFile: {
        select: {
          id: true,
          storageKey: true,
          mimeType: true,
          fileName: true,
        },
      },
      release: {
        select: {
          artist: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  if (!entitlement) {
    console.warn("[library.download] Entitlement token not found.", {
      releaseFileId,
    });
    return NextResponse.json(
      { ok: false, error: "Download entitlement not found." },
      { status: 404 },
    );
  }

  if (entitlement.releaseFileId !== releaseFileId) {
    console.warn("[library.download] Entitlement/release-file mismatch.", {
      requestedReleaseFileId: releaseFileId,
      entitledReleaseFileId: entitlement.releaseFileId,
    });
    return NextResponse.json(
      { ok: false, error: "Release file was not granted by this entitlement." },
      { status: 404 },
    );
  }

  if (isExpired(entitlement.expiresAt, new Date())) {
    console.warn("[library.download] Entitlement expired.", {
      releaseFileId,
    });
    return NextResponse.json(
      { ok: false, error: "Download entitlement has expired." },
      { status: 403 },
    );
  }

  const expiresInSeconds = Math.min(
    readIntegerEnv(
      "SIGNED_URL_EXPIRY_SECONDS",
      DEFAULT_SIGNED_URL_EXPIRY_SECONDS,
    ),
    MAX_SIGNED_URL_EXPIRY_SECONDS,
  );
  const fileName = resolveDownloadFileName({
    artistName: entitlement.release.artist.name,
    fileName: entitlement.releaseFile.fileName,
  });

  const storage = getStorageAdapterFromEnv();
  let signedUrl: string;
  try {
    signedUrl = await getSignedUrl(
      storage.getClient(),
      new GetObjectCommand({
        Bucket: storage.bucket,
        Key: entitlement.releaseFile.storageKey,
        ResponseContentType:
          entitlement.releaseFile.mimeType ?? "application/octet-stream",
        ResponseContentDisposition: `attachment; filename="${fileName}"`,
      }),
      { expiresIn: expiresInSeconds },
    );
  } catch (error) {
    console.error("[library.download] Failed to create signed URL.", {
      releaseFileId,
      storageKey: entitlement.releaseFile.storageKey,
      reason: error instanceof Error ? error.message : "unknown_error",
    });
    return NextResponse.json(
      { ok: false, error: "Could not prepare download URL." },
      { status: 500 },
    );
  }

  logEvent("info", "download.served", {
    kind: "single-file",
    releaseFileId: entitlement.releaseFile.id,
  });

  return NextResponse.redirect(signedUrl, {
    status: 302,
    headers: {
      "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    },
  });
}
