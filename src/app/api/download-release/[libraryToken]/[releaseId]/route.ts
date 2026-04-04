import path from "node:path";
import { PassThrough, Readable } from "node:stream";

import { GetObjectCommand } from "@aws-sdk/client-s3";
import archiver from "archiver";
import { NextResponse } from "next/server";

import {
  type DownloadFormat,
  resolveReleaseFileFormat,
} from "@/lib/checkout/download-format";
import { resolveCurrentReleaseSourceAssets } from "@/lib/checkout/release-files";
import { prisma } from "@/lib/prisma";
import { libraryRateLimitPolicies } from "@/lib/security/library-policies";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { getStorageAdapterFromEnv } from "@/lib/storage/adapter";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ libraryToken: string; releaseId: string }>;
};
type NodeWebReadableStream = import("node:stream/web").ReadableStream<Uint8Array>;

type ReleaseDownloadRow = {
  track: {
    title: string;
    artistName: string;
    trackNumber: number;
  };
  file: {
    storageKey: string;
    fileName: string;
    mimeType: string;
  };
};

type ReleaseDownloadContext = {
  release: {
    title: string;
    coverImageUrl: string | null;
    organizationId: string;
    artist: {
      name: string;
    };
  };
};

function isExpired(expiresAt: Date | null, now: Date) {
  return Boolean(expiresAt && expiresAt.getTime() <= now.getTime());
}

function sanitizeFileName(value: string) {
  const sanitized = value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim();

  return sanitized.length > 0 ? sanitized : "download";
}

function createZipFileName(input: { artistName: string; releaseTitle: string }) {
  return `${sanitizeFileName(`${input.artistName} - ${input.releaseTitle}`)}.zip`;
}

function getTrackExtension(input: { fileName: string; mimeType: string }) {
  const extensionFromName = path.extname(input.fileName).toLowerCase();
  if (extensionFromName) {
    return extensionFromName;
  }

  const normalizedMime = input.mimeType.toLowerCase();
  if (normalizedMime === "audio/flac") {
    return ".flac";
  }
  if (normalizedMime === "audio/mpeg") {
    return ".mp3";
  }
  if (normalizedMime === "audio/mp4" || normalizedMime === "audio/x-m4a") {
    return ".m4a";
  }

  return ".bin";
}

function parseRequestedFormat(request: Request) {
  const value = new URL(request.url).searchParams.get("format")?.trim().toLowerCase();
  if (!value) {
    return null;
  }
  if (value === "mp3" || value === "m4a" || value === "flac") {
    return value as DownloadFormat;
  }
  return null;
}

function createTrackZipEntryName(input: {
  trackArtistName: string;
  releaseTitle: string;
  trackNumber: number;
  trackTitle: string;
  extension: string;
}) {
  const paddedTrackNumber = String(input.trackNumber).padStart(2, "0");
  const baseName = `${input.trackArtistName} - ${input.releaseTitle} - ${paddedTrackNumber} ${input.trackTitle}`;
  return `${sanitizeFileName(baseName)}${input.extension}`;
}

function createCoverZipEntryName(input: {
  artistName: string;
  releaseTitle: string;
  extension: string;
}) {
  return `${sanitizeFileName(`${input.artistName} - ${input.releaseTitle} - Cover`)}${input.extension}`;
}

function resolveCoverArtExtension(input: {
  sourceUrl: string;
  contentType: string | null;
}) {
  const pathname = (() => {
    try {
      return new URL(input.sourceUrl).pathname;
    } catch {
      return "";
    }
  })();

  const extensionFromPath = path.extname(pathname).toLowerCase();
  if (extensionFromPath) {
    return extensionFromPath;
  }

  const type = input.contentType?.toLowerCase() ?? "";
  if (type.includes("image/jpeg")) {
    return ".jpg";
  }
  if (type.includes("image/png")) {
    return ".png";
  }
  if (type.includes("image/webp")) {
    return ".webp";
  }
  if (type.includes("image/gif")) {
    return ".gif";
  }
  return ".bin";
}

function toNodeReadable(body: unknown) {
  if (!body) {
    throw new Error("Storage object body was empty.");
  }

  if (body instanceof Readable) {
    return body;
  }

  if (
    typeof body === "object" &&
    body !== null &&
    "transformToWebStream" in body &&
    typeof body.transformToWebStream === "function"
  ) {
    const webStreamBody = body as {
      transformToWebStream: () => ReadableStream<Uint8Array>;
    };
    return Readable.fromWeb(
      webStreamBody.transformToWebStream() as unknown as NodeWebReadableStream,
    );
  }

  throw new Error("Storage object body is not readable.");
}

async function resolveOwnedReleaseDownloads(input: {
  libraryToken: string;
  releaseId: string;
}) {
  const now = new Date();
  const token = await prisma.buyerLibraryToken.findUnique({
    where: { token: input.libraryToken },
    select: {
      id: true,
      customerId: true,
      revokedAt: true,
      expiresAt: true,
    },
  });

  if (!token) {
    return { ok: false as const, status: 404, error: "Library token not found." };
  }

  if (token.revokedAt) {
    return {
      ok: false as const,
      status: 403,
      error: "Library token has been revoked.",
    };
  }

  if (isExpired(token.expiresAt, now)) {
    return {
      ok: false as const,
      status: 403,
      error: "Library token has expired.",
    };
  }

  const entitledRelease = await prisma.downloadEntitlement.findFirst({
    where: {
      customerId: token.customerId,
      releaseId: input.releaseId,
    },
    select: {
      release: {
        select: {
          organizationId: true,
          title: true,
          coverImageUrl: true,
          artist: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  if (!entitledRelease) {
    return {
      ok: false as const,
      status: 404,
      error: "Release not found in this buyer library.",
    };
  }

  const currentSourceAssets = await resolveCurrentReleaseSourceAssets({
    db: prisma,
    releaseId: input.releaseId,
    organizationId: entitledRelease.release.organizationId,
    includeDeletedRelease: true,
  });
  if (currentSourceAssets.length === 0) {
    return {
      ok: false as const,
      status: 409,
      error: "No downloadable files are currently available for this release.",
    };
  }

  await prisma.buyerLibraryToken.update({
    where: { id: token.id },
    data: {
      lastUsedAt: now,
      accessCount: { increment: 1 },
    },
  });

  return {
    ok: true as const,
    release: entitledRelease.release as ReleaseDownloadContext["release"],
    downloads: currentSourceAssets.map((asset) => {
      const extension = getTrackExtension({
        fileName: asset.storageKey,
        mimeType: asset.mimeType,
      });
      const cleanExtension = extension.startsWith(".")
        ? extension.slice(1)
        : extension;
      return {
        track: {
          title: asset.track.title,
          artistName: entitledRelease.release.artist.name,
          trackNumber: asset.track.trackNumber,
        },
        file: {
          storageKey: asset.storageKey,
          fileName: `${String(asset.track.trackNumber).padStart(2, "0")} - ${asset.track.title}.${cleanExtension}`,
          mimeType: asset.mimeType,
        },
      };
    }) as ReleaseDownloadRow[],
  };
}

export async function GET(request: Request, context: RouteContext) {
  const rateLimitError = await enforceRateLimit(
    request,
    libraryRateLimitPolicies.download,
  );
  if (rateLimitError) {
    return rateLimitError;
  }

  const { libraryToken, releaseId } = await context.params;
  if (!libraryToken || !releaseId) {
    return NextResponse.json(
      { ok: false, error: "Library token and release id are required." },
      { status: 400 },
    );
  }

  const requestedFormat = parseRequestedFormat(request);
  if (!requestedFormat) {
    return NextResponse.json(
      { ok: false, error: "A format query parameter is required (mp3, m4a, or flac)." },
      { status: 400 },
    );
  }

  const resolved = await resolveOwnedReleaseDownloads({
    libraryToken,
    releaseId,
  });
  if (!resolved.ok) {
    return NextResponse.json(
      { ok: false, error: resolved.error },
      { status: resolved.status },
    );
  }

  const downloads = resolved.downloads.filter((entry) => {
    const fileFormat = resolveReleaseFileFormat({
      fileName: entry.file.fileName,
      mimeType: entry.file.mimeType,
    });
    return fileFormat === requestedFormat;
  });

  const availableFormats = Array.from(
    new Set(
      resolved.downloads
        .map((entry) =>
          resolveReleaseFileFormat({
            fileName: entry.file.fileName,
            mimeType: entry.file.mimeType,
          }),
        )
        .filter((value): value is DownloadFormat => value !== null),
    ),
  );

  if (downloads.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: `No files with format "${requestedFormat}" were found for this release.`,
        availableFormats,
      },
      { status: 409 },
    );
  }

  const artistName = resolved.release.artist.name;
  const releaseTitle = resolved.release.title;
  const zipFileName = createZipFileName({ artistName, releaseTitle });

  const storage = getStorageAdapterFromEnv();
  const archive = archiver("zip", {
    zlib: { level: 9 },
  });
  const output = new PassThrough();

  archive.on("warning", (error: unknown) => {
    if ((error as { code?: string }).code === "ENOENT") {
      return;
    }
    output.destroy(error as Error);
  });
  archive.on("error", (error: unknown) => {
    output.destroy(error as Error);
  });
  archive.pipe(output);

  const appendEntries = async () => {
    for (const entry of downloads) {
      const object = await storage.getClient().send(
        new GetObjectCommand({
          Bucket: storage.bucket,
          Key: entry.file.storageKey,
        }),
      );
      const extension = getTrackExtension({
        fileName: entry.file.fileName,
        mimeType: entry.file.mimeType,
      });
      const trackNumber = entry.track.trackNumber;
      const zipEntryName = createTrackZipEntryName({
        trackArtistName: entry.track.artistName,
        releaseTitle,
        trackNumber,
        trackTitle: entry.track.title,
        extension,
      });

      archive.append(toNodeReadable(object.Body), {
        name: zipEntryName,
      });
    }

    const coverImageUrl = resolved.release.coverImageUrl?.trim() ?? "";
    if (coverImageUrl.length > 0) {
      try {
        const coverImageAbsoluteUrl = new URL(coverImageUrl, request.url).toString();
        const coverResponse = await fetch(coverImageAbsoluteUrl, {
          cache: "no-store",
          signal: AbortSignal.timeout(10_000),
        });
        if (coverResponse.ok && coverResponse.body) {
          const coverExtension = resolveCoverArtExtension({
            sourceUrl: coverImageAbsoluteUrl,
            contentType: coverResponse.headers.get("content-type"),
          });
          const coverZipEntryName = createCoverZipEntryName({
            artistName,
            releaseTitle,
            extension: coverExtension,
          });

          archive.append(
            Readable.fromWeb(
              coverResponse.body as unknown as NodeWebReadableStream,
            ),
            {
            name: coverZipEntryName,
            },
          );
        }
      } catch {
        // Cover art is optional for ZIP assembly; skip on fetch failure.
      }
    }

    await archive.finalize();
  };

  void appendEntries().catch((error) => {
    output.destroy(error instanceof Error ? error : new Error("Could not build ZIP."));
  });

  return new NextResponse(output as unknown as BodyInit, {
    status: 200,
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${zipFileName}"`,
      "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    },
  });
}
