import type {
  DeliveryFormat,
  PreviewMode,
  PricingMode,
  ReleaseType,
  ReleaseStatus,
} from "./types";

export const buttonClassName =
  "inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-600 bg-slate-800/60 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-slate-700 hover:text-zinc-50 disabled:cursor-not-allowed disabled:opacity-50";

export const primaryButtonClassName =
  "inline-flex items-center justify-center rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50";

export const dangerButtonClassName =
  "inline-flex min-h-9 items-center justify-center rounded-lg border border-red-800/80 bg-red-950/70 px-3 py-1.5 text-xs font-medium text-red-200 transition hover:bg-red-900/70 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-50";

export const pricingModeOptions: Array<{ value: PricingMode; label: string }> = [
  { value: "FREE", label: "Free" },
  { value: "FIXED", label: "Fixed" },
  { value: "PWYW", label: "Pay What You Want" },
];

export const statusOptions: Array<{ value: ReleaseStatus; label: string }> = [
  { value: "PUBLISHED", label: "Published" },
  { value: "DRAFT", label: "Draft" },
  { value: "ARCHIVED", label: "Archived" },
];

export const releaseTypeOptions: Array<{ value: ReleaseType; label: string }> = [
  { value: "ALBUM", label: "Album" },
  { value: "EP", label: "EP" },
  { value: "SINGLE", label: "Single" },
  { value: "COMPILATION", label: "Compilation" },
  { value: "MIXTAPE", label: "Mixtape" },
  { value: "LIVE_ALBUM", label: "Live Album" },
  { value: "SOUNDTRACK_SCORE", label: "Soundtrack / Score" },
  { value: "DEMO", label: "Demo" },
  { value: "BOOTLEG", label: "Bootleg" },
  { value: "REMIX", label: "Remix" },
  { value: "OTHER", label: "Other" },
];

export const previewModeOptions: Array<{ value: PreviewMode; label: string }> = [
  { value: "CLIP", label: "Clip" },
  { value: "FULL", label: "Full" },
  { value: "NONE", label: "No Preview" },
];

export const deliveryFormatOptions: Array<{
  value: DeliveryFormat;
  label: string;
}> = [
  { value: "MP3", label: "MP3 (320 kbps)" },
  { value: "M4A", label: "M4A (AAC 256 kbps)" },
  { value: "FLAC", label: "FLAC (Lossless)" },
];

export const ALLOWED_COVER_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
]);

export const ALLOWED_AUDIO_MIME_TYPES = new Set([
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
