import path from "node:path";

export type DownloadFormat = "mp3" | "m4a" | "flac";

export function resolveReleaseFileFormat(input: {
  fileName: string;
  mimeType: string;
}): DownloadFormat | null {
  const extension = path.extname(input.fileName).toLowerCase();
  if (extension === ".mp3") {
    return "mp3";
  }
  if (extension === ".m4a") {
    return "m4a";
  }
  if (extension === ".flac") {
    return "flac";
  }

  const normalizedMime = input.mimeType.toLowerCase();
  if (normalizedMime === "audio/mpeg") {
    return "mp3";
  }
  if (normalizedMime === "audio/mp4" || normalizedMime === "audio/x-m4a") {
    return "m4a";
  }
  if (normalizedMime === "audio/flac") {
    return "flac";
  }

  return null;
}

