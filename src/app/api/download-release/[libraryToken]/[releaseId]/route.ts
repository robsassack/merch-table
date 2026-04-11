import { PassThrough, Readable } from "node:stream";

import { GetObjectCommand } from "@aws-sdk/client-s3";
import archiver from "archiver";
import { NextResponse } from "next/server";

import {
  createCoverZipEntryName,
  createTrackZipEntryName,
  createZipFileName,
  getTrackExtension,
  parseRequestedFormat,
  parseZipDownloadMode,
  resolveCoverArtExtension,
  resolveOwnedReleaseDownloads,
  resolveStorageKeyFromPublicCoverUrl,
  selectBestAvailableDownloads,
  toNodeReadable,
} from "@/lib/checkout/release-zip";
import {
  type DownloadFormat,
  resolveReleaseFileFormat,
} from "@/lib/checkout/download-format";
import { logEvent } from "@/lib/logging";
import { libraryRateLimitPolicies } from "@/lib/security/library-policies";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { getStorageAdapterFromEnv } from "@/lib/storage/adapter";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ libraryToken: string; releaseId: string }>;
};
type NodeWebReadableStream = import("node:stream/web").ReadableStream<Uint8Array>;

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
  const zipMode = parseZipDownloadMode(request);

  const resolved = await resolveOwnedReleaseDownloads({
    libraryToken,
    releaseId,
  });
  if (!resolved.ok) {
    console.warn("[library.download_release] Access denied.", {
      releaseId,
      status: resolved.status,
      reason: resolved.error,
    });
    return NextResponse.json(
      { ok: false, error: resolved.error },
      { status: resolved.status },
    );
  }

  const downloads =
    requestedFormat === null
      ? zipMode === "all"
        ? resolved.downloads
        : selectBestAvailableDownloads(resolved.downloads)
      : resolved.downloads.filter((entry) => {
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

  if (downloads.length === 0 && requestedFormat !== null) {
    console.warn("[library.download_release] Requested format unavailable.", {
      releaseId,
      requestedFormat,
      availableFormats,
    });
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
        const appendCoverFromHttp = async () => {
          const coverResponse = await fetch(coverImageAbsoluteUrl, {
            cache: "no-store",
            signal: AbortSignal.timeout(10_000),
          });
          if (!coverResponse.ok || !coverResponse.body) {
            return false;
          }

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
          return true;
        };

        const appendCoverFromStorage = async () => {
          const coverStorageKey = resolveStorageKeyFromPublicCoverUrl(
            coverImageAbsoluteUrl,
          );
          if (!coverStorageKey) {
            return false;
          }

          const coverObject = await storage.getClient().send(
            new GetObjectCommand({
              Bucket: storage.bucket,
              Key: coverStorageKey,
            }),
          );
          const coverExtension = resolveCoverArtExtension({
            sourceUrl: coverImageAbsoluteUrl,
            contentType:
              typeof coverObject.ContentType === "string"
                ? coverObject.ContentType
                : null,
          });
          const coverZipEntryName = createCoverZipEntryName({
            artistName,
            releaseTitle,
            extension: coverExtension,
          });

          archive.append(toNodeReadable(coverObject.Body), {
            name: coverZipEntryName,
          });
          return true;
        };

        const appendedFromHttp = await appendCoverFromHttp();
        if (!appendedFromHttp) {
          const appendedFromStorage = await appendCoverFromStorage();
          if (!appendedFromStorage) {
            console.warn(
              "[library.download_release] Cover art not added to ZIP (unresolvable source).",
              { releaseId, coverImageUrl: coverImageAbsoluteUrl },
            );
          }
        }
      } catch (error) {
        // Cover art is optional for ZIP assembly; skip on fetch failure.
        console.warn("[library.download_release] Cover art fetch failed.", {
          releaseId,
          reason: error instanceof Error ? error.message : "unknown_error",
        });
      }
    }

    await archive.finalize();
  };

  void appendEntries().catch((error) => {
    console.error("[library.download_release] ZIP assembly failed.", {
      releaseId,
      requestedFormat,
      zipMode,
      reason: error instanceof Error ? error.message : "unknown_error",
    });
    output.destroy(error instanceof Error ? error : new Error("Could not build ZIP."));
  });

  logEvent("info", "download.served", {
    kind: "release-zip",
    releaseId,
    requestedFormat,
    zipMode,
    fileCount: downloads.length,
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
