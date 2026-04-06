import type {
  DeliveryFormat,
  NewTrackDraft,
  ReleaseDraft,
  ReleaseMutationResponse,
  ReleasePreviewDraft,
  ReleaseRecord,
  TrackDraft,
  TrackRecord,
} from "./types";

const DEFAULT_DELIVERY_FORMATS: DeliveryFormat[] = ["MP3", "M4A", "FLAC"];
const TRACK_STATUS_CHIP_BASE_CLASS_NAME =
  "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none";

function withTrackStatusTone(toneClassName: string) {
  return `${TRACK_STATUS_CHIP_BASE_CLASS_NAME} ${toneClassName}`;
}

export function moveItemInArray<T>(items: T[], fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex) {
    return [...items];
  }

  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  if (!moved) {
    return next;
  }
  next.splice(toIndex, 0, moved);
  return next;
}

const AUDIO_EXTENSION_TO_MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  flac: "audio/flac",
  aac: "audio/aac",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  webm: "audio/webm",
  aif: "audio/aiff",
  aiff: "audio/aiff",
};

export function isBlobObjectUrl(value: string | null | undefined): value is string {
  return typeof value === "string" && value.startsWith("blob:");
}

export function sanitizeUrlInput(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function slugify(value: string) {
  const slug = sanitizeUrlInput(value);
  return slug.length > 0 ? slug : "release";
}

export function centsToDecimalString(cents: number | null | undefined) {
  if (!Number.isFinite(cents ?? null) || cents === null || cents === undefined) {
    return "";
  }

  return (cents / 100).toFixed(2);
}

export function parseCurrencyInputToCents(value: string) {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Math.round(parsed * 100);
}

export function parsePositiveInteger(value: string) {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.round(parsed);
}

export function getFileExtension(fileName: string) {
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex < 0 || dotIndex === fileName.length - 1) {
    return "";
  }

  return fileName.slice(dotIndex + 1).toLowerCase();
}

export function resolveUploadedFileNameFromStorageKey(storageKey: string) {
  const trimmed = storageKey.trim();
  if (trimmed.length === 0) {
    return "";
  }

  const lastSegment = trimmed.split("/").pop() ?? trimmed;
  const decoded = (() => {
    try {
      return decodeURIComponent(lastSegment);
    } catch {
      return lastSegment;
    }
  })();

  // Upload keys currently prefix original file names with a UUID token.
  const withoutUuidPrefix = decoded.replace(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-/i,
    "",
  );

  return withoutUuidPrefix.length > 0 ? withoutUuidPrefix : decoded;
}

export function resolveAudioMimeType(file: File) {
  const fromBrowser = file.type?.trim().toLowerCase();
  if (fromBrowser.length > 0) {
    return fromBrowser;
  }

  const extension = getFileExtension(file.name);
  return AUDIO_EXTENSION_TO_MIME[extension] ?? "";
}

export function uploadViaSignedPut(input: {
  uploadUrl: string;
  file: File;
  contentType: string;
  requiredHeaders: Record<string, string>;
  onProgress: (percent: number) => void;
}) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", input.uploadUrl);

    xhr.setRequestHeader(
      "content-type",
      input.requiredHeaders["content-type"] ?? input.contentType,
    );

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) {
        return;
      }

      const percent = Math.max(
        0,
        Math.min(100, Math.round((event.loaded / event.total) * 100)),
      );
      input.onProgress(percent);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        input.onProgress(100);
        resolve();
        return;
      }

      reject(new Error(`Upload failed with status ${xhr.status}.`));
    };

    xhr.onerror = () => {
      reject(new Error("Upload failed due to a network error."));
    };

    xhr.send(input.file);
  });
}

export function getTodayDateInputValue() {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function toDateInputValue(isoDateTime: string) {
  const parsed = new Date(isoDateTime);
  if (Number.isNaN(parsed.getTime())) {
    return getTodayDateInputValue();
  }

  const year = String(parsed.getUTCFullYear());
  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const day = String(parsed.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function toCoverDisplaySrc(url: string) {
  const trimmed = url.trim();
  if (trimmed.length === 0) {
    return "";
  }

  if (
    trimmed.startsWith("blob:") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("/api/admin/releases/cover-proxy?")
  ) {
    return trimmed;
  }

  return `/api/admin/releases/cover-proxy?url=${encodeURIComponent(trimmed)}`;
}

export function formatCurrency(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function getReleaseUrlPreview(title: string, slug: string) {
  const custom = sanitizeUrlInput(slug);
  const resolved = custom.length > 0 ? custom : slugify(title);
  return `/release/${resolved}`;
}

export function toReleaseDraft(release: ReleaseRecord): ReleaseDraft {
  return {
    artistId: release.artistId,
    title: release.title,
    releaseType: release.releaseType,
    label: release.label,
    slug: release.slug,
    description: release.description ?? "",
    coverImageUrl: release.coverImageUrl ?? "",
    coverStorageKey: null,
    removeCoverImage: false,
    pricingMode: release.pricingMode,
    fixedPrice: centsToDecimalString(release.fixedPriceCents),
    minimumPrice: centsToDecimalString(release.minimumPriceCents),
    deliveryFormats:
      Array.isArray(release.deliveryFormats) && release.deliveryFormats.length > 0
        ? release.deliveryFormats
        : DEFAULT_DELIVERY_FORMATS,
    allowFreeCheckout:
      release.pricingMode === "PWYW" && (release.minimumPriceCents ?? null) === 0,
    status: release.status,
    releaseDate: toDateInputValue(release.releaseDate),
    markLossyOnly: release.isLossyOnly,
    confirmLossyOnly: release.isLossyOnly,
  };
}

export function toTrackDraft(track: TrackRecord): TrackDraft {
  return {
    title: track.title,
    artistOverride: track.artistOverride ?? "",
    trackNumber: String(track.trackNumber),
    lyrics: track.lyrics ?? "",
    credits: track.credits ?? "",
  };
}

export function toNewTrackDraft(release: ReleaseRecord): NewTrackDraft {
  return {
    title: "",
    artistOverride: "",
    trackNumber: String(release.tracks.length + 1),
    lyrics: "",
    credits: "",
  };
}

export function toReleasePreviewDraft(release: ReleaseRecord): ReleasePreviewDraft {
  const firstTrack = sortTracks(release.tracks)[0];
  if (!firstTrack) {
    return {
      previewMode: "CLIP",
      previewSeconds: "30",
    };
  }

  return {
    previewMode: firstTrack.previewMode,
    previewSeconds:
      firstTrack.previewMode === "CLIP" ? String(firstTrack.previewSeconds ?? 30) : "30",
  };
}

export function resolvePreviewPayload(draft: ReleasePreviewDraft) {
  if (draft.previewMode === "FULL") {
    return {
      previewMode: "FULL" as const,
      previewSeconds: null,
    };
  }

  return {
    previewMode: "CLIP" as const,
    previewSeconds: parsePositiveInteger(draft.previewSeconds) ?? 30,
  };
}

export function formatTrackDuration(durationMs: number | null) {
  if (!durationMs || durationMs <= 0) {
    return "unknown";
  }

  const totalSeconds = Math.round(durationMs / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function sortTracks(tracks: TrackRecord[]) {
  return [...tracks].sort(
    (a, b) => a.trackNumber - b.trackNumber || a.createdAt.localeCompare(b.createdAt),
  );
}

export function withReleaseDerivedTrackStats(release: ReleaseRecord): ReleaseRecord {
  const trackAssetCount = release.tracks.reduce(
    (sum, track) => sum + track.assets.length,
    0,
  );
  const hasLosslessMasters = release.tracks.some((track) =>
    track.assets.some((asset) => asset.isLossless),
  );

  return {
    ...release,
    tracks: sortTracks(release.tracks),
    trackAssetCount,
    hasLosslessMasters,
    qualityDisclosureRequired:
      release.isLossyOnly || (trackAssetCount > 0 && !hasLosslessMasters),
    _count: {
      ...release._count,
      tracks: release.tracks.length,
    },
  };
}

export function areAllMasterAssetsLossless(release: ReleaseRecord) {
  const masterAssets = release.tracks.flatMap((track) =>
    track.assets.filter((asset) => asset.assetRole === "MASTER"),
  );

  return masterAssets.length > 0 && masterAssets.every((asset) => asset.isLossless);
}

export function getTrackPreviewStatus(track: TrackRecord) {
  const previewJobs = track.transcodeJobs.filter(
    (job) => job.jobKind === "PREVIEW_CLIP",
  );

  if (track.previewMode === "FULL") {
    return {
      label: "full preview",
      className: withTrackStatusTone("border-sky-700/70 bg-sky-950/40 text-sky-300"),
    };
  }

  const previewAsset = track.assets
    .filter((asset) => asset.assetRole === "PREVIEW")
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )[0];
  const configuredPreviewSeconds = track.previewSeconds ?? 30;
  const encodedPreviewSeconds = (() => {
    if (!previewAsset) {
      return null;
    }

    const match = previewAsset.storageKey.match(/-(\d+)s\.mp3$/i);
    if (!match || !match[1]) {
      return null;
    }

    const parsed = Number(match[1]);
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
  })();
  const previewMatchesCurrentConfig =
    !previewAsset ||
    encodedPreviewSeconds === null ||
    encodedPreviewSeconds === configuredPreviewSeconds;

  const runningJob = previewJobs.find((job) => job.status === "RUNNING");
  if (runningJob && (!previewAsset || !previewMatchesCurrentConfig)) {
    return {
      label: previewAsset ? "preview updating" : "preview running",
      className: withTrackStatusTone("border-indigo-700/70 bg-indigo-950/40 text-indigo-300"),
    };
  }

  const queuedJob = previewJobs.find((job) => job.status === "QUEUED");
  if (queuedJob && (!previewAsset || !previewMatchesCurrentConfig)) {
    return {
      label: previewAsset ? "preview updating" : "preview queued",
      className: withTrackStatusTone("border-blue-700/70 bg-blue-950/40 text-blue-300"),
    };
  }

  if (previewAsset) {
    if (!previewMatchesCurrentConfig) {
      return {
        label: "preview pending update",
        className: withTrackStatusTone("border-amber-700/70 bg-amber-950/40 text-amber-300"),
      };
    }

    return {
      label: "preview ready",
      className: withTrackStatusTone("border-emerald-700/70 bg-emerald-950/40 text-emerald-300"),
    };
  }

  const failedJob = previewJobs.find((job) => job.status === "FAILED");
  if (failedJob) {
    return {
      label: "preview failed",
      className: withTrackStatusTone("border-rose-700/70 bg-rose-950/40 text-rose-300"),
    };
  }

  return {
    label: "no preview",
    className: withTrackStatusTone("border-slate-700/80 bg-slate-900/70 text-zinc-400"),
  };
}

function normalizeDeliveryAssetFormat(format: string): DeliveryFormat | null {
  const normalized = format.trim().toUpperCase();
  if (normalized === "MP3") {
    return "MP3";
  }

  if (normalized === "M4A" || normalized === "AAC" || normalized === "MP4") {
    return "M4A";
  }

  if (normalized === "FLAC") {
    return "FLAC";
  }

  return null;
}

export function getTrackDeliveryStatus(
  track: TrackRecord,
  enabledFormats: DeliveryFormat[],
) {
  const hasLosslessMaster = track.assets.some(
    (asset) => asset.assetRole === "MASTER" && asset.isLossless,
  );

  const enabled = new Set(
    enabledFormats.length > 0 ? enabledFormats : DEFAULT_DELIVERY_FORMATS,
  );
  const available = new Set<DeliveryFormat>();

  for (const asset of track.assets) {
    if (asset.assetRole !== "DELIVERY") {
      continue;
    }

    const normalized = normalizeDeliveryAssetFormat(asset.format);
    if (normalized && enabled.has(normalized)) {
      available.add(normalized);
    }
  }

  for (const asset of track.assets) {
    if (asset.assetRole !== "MASTER" || asset.isLossless) {
      continue;
    }

    const normalized = normalizeDeliveryAssetFormat(asset.format);
    if (normalized && enabled.has(normalized)) {
      available.add(normalized);
    }
  }

  // A lossless master can fulfill FLAC availability even when a dedicated
  // DELIVERY FLAC transcode has not been generated yet.
  if (hasLosslessMaster && enabled.has("FLAC")) {
    available.add("FLAC");
  }

  if (!hasLosslessMaster && available.size === 0) {
    return {
      label: "delivery n/a",
      className: withTrackStatusTone("border-slate-700/80 bg-slate-900/70 text-zinc-400"),
    };
  }

  const completeLabel = `${available.size}/${enabled.size}`;
  if (available.size >= enabled.size) {
    return {
      label: `delivery ready ${completeLabel}`,
      className: withTrackStatusTone("border-emerald-700/70 bg-emerald-950/40 text-emerald-300"),
    };
  }

  if (available.size > 0) {
    return {
      label: `delivery partial ${completeLabel}`,
      className: withTrackStatusTone("border-amber-700/70 bg-amber-950/40 text-amber-300"),
    };
  }

  return {
    label: `delivery pending ${completeLabel}`,
    className: withTrackStatusTone("border-blue-700/70 bg-blue-950/40 text-blue-300"),
  };
}

export function getMutationError(responseBody: ReleaseMutationResponse | null, fallback: string) {
  if (responseBody?.error && responseBody.error.length > 0) {
    return responseBody.error;
  }

  return fallback;
}
