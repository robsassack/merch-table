export const DEFAULT_MAX_UPLOAD_SIZE_BYTES = 2 * 1024 * 1024 * 1024;

export const ALLOWED_UPLOAD_AUDIO_CONTENT_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/vnd.wave",
  "audio/x-pn-wav",
  "audio/flac",
  "audio/x-flac",
  "audio/aac",
  "audio/mp4",
  "audio/x-m4a",
  "audio/ogg",
  "audio/webm",
  "audio/aiff",
  "audio/x-aiff",
]);

export function readIntegerEnv(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

export function readMaxUploadSizeBytesFromEnv() {
  return readIntegerEnv("MAX_UPLOAD_SIZE_BYTES", DEFAULT_MAX_UPLOAD_SIZE_BYTES);
}

export function normalizeContentType(contentType: string) {
  const [baseType] = contentType.split(";");
  return (baseType ?? "").trim().toLowerCase();
}

export function isAllowedUploadContentType(contentType: string) {
  return ALLOWED_UPLOAD_AUDIO_CONTENT_TYPES.has(normalizeContentType(contentType));
}
