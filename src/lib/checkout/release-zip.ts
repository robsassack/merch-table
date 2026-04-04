import path from "node:path";
import { Readable } from "node:stream";

import { prisma } from "@/lib/prisma";

import {
  type DownloadFormat,
  resolveReleaseFileFormat,
} from "./download-format";
import { resolveCurrentReleaseSourceAssets } from "./release-files";

type NodeWebReadableStream = import("node:stream/web").ReadableStream<Uint8Array>;

export type ReleaseDownloadRow = {
  track: {
    id: string;
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

export type ReleaseDownloadContext = {
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

export function createZipFileName(input: {
  artistName: string;
  releaseTitle: string;
}) {
  return `${sanitizeFileName(`${input.artistName} - ${input.releaseTitle}`)}.zip`;
}

export function getTrackExtension(input: { fileName: string; mimeType: string }) {
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

export function parseRequestedFormat(request: Request) {
  const value = new URL(request.url).searchParams.get("format")?.trim().toLowerCase();
  if (!value) {
    return null;
  }
  if (value === "mp3" || value === "m4a" || value === "flac") {
    return value as DownloadFormat;
  }
  return null;
}

export function parseZipDownloadMode(request: Request) {
  const value = new URL(request.url).searchParams.get("mode")?.trim().toLowerCase();
  if (value === "all") {
    return "all" as const;
  }
  return "best" as const;
}

export function resolveStorageKeyFromPublicCoverUrl(sourceUrl: string) {
  const publicBase = process.env.STORAGE_PUBLIC_BASE_URL?.trim();
  if (!publicBase) {
    return null;
  }

  try {
    const parsedBase = new URL(publicBase.endsWith("/") ? publicBase : `${publicBase}/`);
    const parsedSource = new URL(sourceUrl);
    if (parsedBase.origin !== parsedSource.origin) {
      return null;
    }

    const basePath = parsedBase.pathname.endsWith("/")
      ? parsedBase.pathname
      : `${parsedBase.pathname}/`;
    if (!parsedSource.pathname.startsWith(basePath)) {
      return null;
    }

    const relative = parsedSource.pathname.slice(basePath.length).trim();
    if (!relative) {
      return null;
    }

    return decodeURIComponent(relative);
  } catch {
    return null;
  }
}

export function createTrackZipEntryName(input: {
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

export function createCoverZipEntryName(input: {
  artistName: string;
  releaseTitle: string;
  extension: string;
}) {
  return `${sanitizeFileName(`${input.artistName} - ${input.releaseTitle} - Cover`)}${input.extension}`;
}

function getFormatRank(format: DownloadFormat | null) {
  if (format === "flac") {
    return 0;
  }
  if (format === "m4a") {
    return 1;
  }
  if (format === "mp3") {
    return 2;
  }
  return 3;
}

export function selectBestAvailableDownloads(downloads: ReleaseDownloadRow[]) {
  const bestByTrackId = new Map<string, ReleaseDownloadRow>();
  for (const entry of downloads) {
    const key = entry.track.id;
    const nextFormat = resolveReleaseFileFormat({
      fileName: entry.file.fileName,
      mimeType: entry.file.mimeType,
    });
    const existing = bestByTrackId.get(key);
    if (!existing) {
      bestByTrackId.set(key, entry);
      continue;
    }

    const existingFormat = resolveReleaseFileFormat({
      fileName: existing.file.fileName,
      mimeType: existing.file.mimeType,
    });
    if (getFormatRank(nextFormat) < getFormatRank(existingFormat)) {
      bestByTrackId.set(key, entry);
    }
  }

  return Array.from(bestByTrackId.values()).sort((a, b) => {
    if (a.track.trackNumber !== b.track.trackNumber) {
      return a.track.trackNumber - b.track.trackNumber;
    }
    return a.track.title.localeCompare(b.track.title);
  });
}

export function resolveCoverArtExtension(input: {
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

export function toNodeReadable(body: unknown) {
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

export async function resolveOwnedReleaseDownloads(input: {
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
          id: asset.trackId,
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
