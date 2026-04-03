import {
  normalizeDetectedDurationMs,
  normalizeMetadataTrackNumber,
  resolveImportedTrackTitle,
} from "@/lib/audio/track-import";

export type ParsedTrackImportFileMetadata = {
  file: File;
  fileName: string;
  metadataTitle: string | null;
  resolvedTitle: string;
  metadataTrackNumber: number | null;
  durationMs: number | null;
};

async function readDurationFromAudioElement(file: File) {
  return new Promise<number | null>((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const audio = new Audio();
    const settle = (value: number | null) => {
      audio.src = "";
      URL.revokeObjectURL(objectUrl);
      resolve(value);
    };

    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
        settle(null);
        return;
      }

      settle(normalizeDetectedDurationMs(audio.duration * 1_000));
    };
    audio.onerror = () => settle(null);
    audio.src = objectUrl;
  });
}

export async function parseTrackImportFileMetadata(
  file: File,
): Promise<ParsedTrackImportFileMetadata> {
  let metadataTitle: string | null = null;
  let metadataTrackNumber: number | null = null;
  let durationMs: number | null = null;

  try {
    const { parseBlob } = await import("music-metadata");
    const parsed = await parseBlob(file, { duration: true });

    const trackNo = parsed.common.track.no;
    metadataTitle =
      typeof parsed.common.title === "string" ? parsed.common.title.trim() : null;
    metadataTrackNumber = normalizeMetadataTrackNumber(trackNo);
    durationMs = normalizeDetectedDurationMs((parsed.format.duration ?? 0) * 1_000);
  } catch {
    // Fallbacks below cover unsupported or corrupted metadata.
  }

  if (durationMs === null) {
    durationMs = await readDurationFromAudioElement(file);
  }

  return {
    file,
    fileName: file.name,
    metadataTitle,
    resolvedTitle: resolveImportedTrackTitle({
      metadataTitle,
      fileName: file.name,
    }),
    metadataTrackNumber,
    durationMs,
  };
}
