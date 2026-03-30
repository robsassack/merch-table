import type {
  NewTrackDraft,
  ReleaseDraft,
  ReleaseMutationResponse,
  ReleasePreviewDraft,
  ReleaseRecord,
  TrackDraft,
  TrackRecord,
} from "./types";

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
    slug: release.slug,
    description: release.description ?? "",
    coverImageUrl: release.coverImageUrl ?? "",
    coverStorageKey: null,
    removeCoverImage: false,
    pricingMode: release.pricingMode,
    fixedPrice: centsToDecimalString(release.fixedPriceCents),
    minimumPrice: centsToDecimalString(release.minimumPriceCents),
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
    trackNumber: String(track.trackNumber),
    lyrics: track.lyrics ?? "",
    credits: track.credits ?? "",
  };
}

export function toNewTrackDraft(release: ReleaseRecord): NewTrackDraft {
  return {
    title: "",
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

export function getTrackPreviewStatus(track: TrackRecord) {
  if (track.previewMode === "FULL") {
    return {
      label: "full preview",
      className:
        "rounded-full border border-sky-700/70 bg-sky-950/40 px-2 py-0.5 text-[11px] font-medium text-sky-300",
    };
  }

  const previewAsset = track.assets.find((asset) => asset.assetRole === "PREVIEW");
  if (previewAsset) {
    return {
      label: "preview ready",
      className:
        "rounded-full border border-emerald-700/70 bg-emerald-950/40 px-2 py-0.5 text-[11px] font-medium text-emerald-300",
    };
  }

  const runningJob = track.transcodeJobs.find((job) => job.status === "RUNNING");
  if (runningJob) {
    return {
      label: "preview running",
      className:
        "rounded-full border border-indigo-700/70 bg-indigo-950/40 px-2 py-0.5 text-[11px] font-medium text-indigo-300",
    };
  }

  const queuedJob = track.transcodeJobs.find((job) => job.status === "QUEUED");
  if (queuedJob) {
    return {
      label: "preview queued",
      className:
        "rounded-full border border-blue-700/70 bg-blue-950/40 px-2 py-0.5 text-[11px] font-medium text-blue-300",
    };
  }

  const failedJob = track.transcodeJobs.find((job) => job.status === "FAILED");
  if (failedJob) {
    return {
      label: "preview failed",
      className:
        "rounded-full border border-rose-700/70 bg-rose-950/40 px-2 py-0.5 text-[11px] font-medium text-rose-300",
    };
  }

  return {
    label: "no preview",
    className:
      "rounded-full border border-slate-700/80 bg-slate-900/70 px-2 py-0.5 text-[11px] font-medium text-zinc-400",
  };
}

export function getMutationError(responseBody: ReleaseMutationResponse | null, fallback: string) {
  if (responseBody?.error && responseBody.error.length > 0) {
    return responseBody.error;
  }

  return fallback;
}
