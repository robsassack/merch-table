"use client";

import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  assignSequentialTrackNumbers,
  resolveTrackImportOrder,
} from "@/lib/audio/track-import";
import {
  parseTrackImportFileMetadata,
  type ParsedTrackImportFileMetadata,
} from "@/lib/audio/track-import-browser";
import {
  estimateNetPayoutCents,
  estimateStripeFeeCents,
} from "@/lib/pricing/pricing-rules";
import { formatIsoTimestampForDisplay } from "@/lib/time/format-display";

type PricingMode = "FREE" | "FIXED" | "PWYW";
type ReleaseStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
type PreviewMode = "CLIP" | "FULL";
type AssetRole = "MASTER" | "PREVIEW" | "DELIVERY";
type TranscodeStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";

type ArtistOption = {
  id: string;
  name: string;
  deletedAt: string | null;
};

type ReleaseRecord = {
  id: string;
  artistId: string;
  title: string;
  slug: string;
  description: string | null;
  coverImageUrl: string | null;
  pricingMode: PricingMode;
  fixedPriceCents: number | null;
  minimumPriceCents: number | null;
  priceCents: number;
  currency: string;
  status: ReleaseStatus;
  releaseDate: string;
  publishedAt: string | null;
  deletedAt: string | null;
  isLossyOnly: boolean;
  qualityDisclosureRequired: boolean;
  hasLosslessMasters: boolean;
  trackAssetCount: number;
  createdAt: string;
  updatedAt: string;
  artist: {
    id: string;
    name: string;
    deletedAt: string | null;
  };
  tracks: TrackRecord[];
  _count: {
    tracks: number;
    files: number;
    orderItems: number;
  };
};

type TrackAssetRecord = {
  id: string;
  storageKey: string;
  format: string;
  mimeType: string;
  fileSizeBytes: number;
  bitrateKbps: number | null;
  sampleRateHz: number | null;
  channels: number | null;
  isLossless: boolean;
  assetRole: AssetRole;
  createdAt: string;
  updatedAt: string;
};

type TrackTranscodeJobRecord = {
  id: string;
  sourceAssetId: string;
  status: TranscodeStatus;
  errorMessage: string | null;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type TrackRecord = {
  id: string;
  title: string;
  trackNumber: number;
  durationMs: number | null;
  lyrics: string | null;
  credits: string | null;
  previewMode: PreviewMode;
  previewSeconds: number | null;
  createdAt: string;
  updatedAt: string;
  assets: TrackAssetRecord[];
  transcodeJobs: TrackTranscodeJobRecord[];
};

type ReleasesListResponse = {
  ok?: boolean;
  error?: string;
  minimumPriceFloorCents?: number;
  storeCurrency?: string;
  stripeFeeEstimate?: {
    percentBps: number;
    fixedFeeCents: number;
  };
  artists?: ArtistOption[];
  releases?: ReleaseRecord[];
};

type ReleaseMutationResponse = {
  ok?: boolean;
  error?: string;
  release?: ReleaseRecord;
  hardDeletedReleaseId?: string;
  purgedAssetCount?: number;
};

type TrackMutationResponse = {
  ok?: boolean;
  error?: string;
  track?: TrackRecord;
  deletedTrackId?: string;
};

type UploadUrlResponse = {
  ok?: boolean;
  error?: string;
  storageProvider?: "MINIO" | "S3";
  bucket?: string;
  storageKey?: string;
  uploadUrl?: string;
  expiresInSeconds?: number;
  requiredHeaders?: Record<string, string>;
};

type TrackAssetCommitResponse = {
  ok?: boolean;
  error?: string;
  previewJobQueued?: boolean;
};

type CoverUploadUrlResponse = {
  ok?: boolean;
  error?: string;
  storageKey?: string;
  publicUrl?: string;
  uploadUrl?: string;
  requiredHeaders?: Record<string, string>;
};

type ReleaseDraft = {
  artistId: string;
  title: string;
  slug: string;
  description: string;
  coverImageUrl: string;
  coverStorageKey: string | null;
  removeCoverImage: boolean;
  pricingMode: PricingMode;
  fixedPrice: string;
  minimumPrice: string;
  allowFreeCheckout: boolean;
  status: ReleaseStatus;
  releaseDate: string;
  markLossyOnly: boolean;
  confirmLossyOnly: boolean;
};

type TrackDraft = {
  title: string;
  trackNumber: string;
  lyrics: string;
  credits: string;
};

type NewTrackDraft = {
  title: string;
  trackNumber: string;
  lyrics: string;
  credits: string;
};

type ReleasePreviewDraft = {
  previewMode: PreviewMode;
  previewSeconds: string;
};

type TrackImportMode = "append" | "replace";
type TrackImportStatus = "pending" | "track-created" | "uploaded" | "failed";

type TrackImportJob = {
  id: string;
  fileName: string;
  title: string;
  plannedTrackNumber: number;
  durationMs: number | null;
  status: TrackImportStatus;
  error: string | null;
};

type PlannedTrackImport = {
  id: string;
  file: File;
  fileName: string;
  contentType: string;
  metadata: ParsedTrackImportFileMetadata;
  trackNumber: number;
};

type TrackRecordPatch = {
  id: string;
  title: string;
  trackNumber: number;
  durationMs: number | null;
  lyrics: string | null;
  credits: string | null;
  previewMode: PreviewMode;
  previewSeconds: number | null;
  createdAt: string;
  updatedAt: string;
  assets: TrackAssetRecord[];
  transcodeJobs: TrackTranscodeJobRecord[];
};

function moveItemInArray<T>(items: T[], fromIndex: number, toIndex: number) {
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

const buttonClassName =
  "inline-flex items-center justify-center rounded-lg border border-slate-600 bg-slate-800/60 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-slate-700 hover:text-zinc-50 disabled:cursor-not-allowed disabled:opacity-50";

const primaryButtonClassName =
  "inline-flex items-center justify-center rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50";

const dangerButtonClassName =
  "inline-flex items-center justify-center rounded-lg border border-red-800/80 bg-red-950/70 px-3 py-1.5 text-xs font-medium text-red-200 transition hover:bg-red-900/70 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-50";

const pricingModeOptions: Array<{ value: PricingMode; label: string }> = [
  { value: "FREE", label: "Free" },
  { value: "FIXED", label: "Fixed" },
  { value: "PWYW", label: "Pay What You Want" },
];

const statusOptions: Array<{ value: ReleaseStatus; label: string }> = [
  { value: "PUBLISHED", label: "Published" },
  { value: "DRAFT", label: "Draft" },
  { value: "ARCHIVED", label: "Archived" },
];

const previewModeOptions: Array<{ value: PreviewMode; label: string }> = [
  { value: "CLIP", label: "Clip" },
  { value: "FULL", label: "Full" },
];

const ALLOWED_COVER_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
]);

const ALLOWED_AUDIO_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
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

function isBlobObjectUrl(value: string | null | undefined): value is string {
  return typeof value === "string" && value.startsWith("blob:");
}

function sanitizeUrlInput(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function slugify(value: string) {
  const slug = sanitizeUrlInput(value);
  return slug.length > 0 ? slug : "release";
}

function centsToDecimalString(cents: number | null | undefined) {
  if (!Number.isFinite(cents ?? null) || cents === null || cents === undefined) {
    return "";
  }

  return (cents / 100).toFixed(2);
}

function parseCurrencyInputToCents(value: string) {
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

function parsePositiveInteger(value: string) {
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

function getFileExtension(fileName: string) {
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex < 0 || dotIndex === fileName.length - 1) {
    return "";
  }

  return fileName.slice(dotIndex + 1).toLowerCase();
}

function resolveAudioMimeType(file: File) {
  const fromBrowser = file.type?.trim().toLowerCase();
  if (fromBrowser.length > 0) {
    return fromBrowser;
  }

  const extension = getFileExtension(file.name);
  return AUDIO_EXTENSION_TO_MIME[extension] ?? "";
}

function uploadViaSignedPut(input: {
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

function getTodayDateInputValue() {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDateInputValue(isoDateTime: string) {
  const parsed = new Date(isoDateTime);
  if (Number.isNaN(parsed.getTime())) {
    return getTodayDateInputValue();
  }

  const year = String(parsed.getUTCFullYear());
  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const day = String(parsed.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toCoverDisplaySrc(url: string) {
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

function formatCurrency(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function getReleaseUrlPreview(title: string, slug: string) {
  const custom = sanitizeUrlInput(slug);
  const resolved = custom.length > 0 ? custom : slugify(title);
  return `/release/${resolved}`;
}

function toReleaseDraft(release: ReleaseRecord): ReleaseDraft {
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

function toTrackDraft(track: TrackRecord): TrackDraft {
  return {
    title: track.title,
    trackNumber: String(track.trackNumber),
    lyrics: track.lyrics ?? "",
    credits: track.credits ?? "",
  };
}

function toNewTrackDraft(release: ReleaseRecord): NewTrackDraft {
  return {
    title: "",
    trackNumber: String(release.tracks.length + 1),
    lyrics: "",
    credits: "",
  };
}

function toReleasePreviewDraft(release: ReleaseRecord): ReleasePreviewDraft {
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

function resolvePreviewPayload(draft: ReleasePreviewDraft) {
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

function formatTrackDuration(durationMs: number | null) {
  if (!durationMs || durationMs <= 0) {
    return "unknown";
  }

  const totalSeconds = Math.round(durationMs / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function sortTracks(tracks: TrackRecord[]) {
  return [...tracks].sort(
    (a, b) => a.trackNumber - b.trackNumber || a.createdAt.localeCompare(b.createdAt),
  );
}

function withReleaseDerivedTrackStats(release: ReleaseRecord): ReleaseRecord {
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

function getTrackPreviewStatus(track: TrackRecord) {
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

function getMutationError(responseBody: ReleaseMutationResponse | null, fallback: string) {
  if (responseBody?.error && responseBody.error.length > 0) {
    return responseBody.error;
  }

  return fallback;
}

export function ReleaseManagementPanel() {
  const [isHydrated, setIsHydrated] = useState(false);
  const localObjectUrlsRef = useRef<Set<string>>(new Set());

  const [artists, setArtists] = useState<ArtistOption[]>([]);
  const [releases, setReleases] = useState<ReleaseRecord[]>([]);
  const [draftsById, setDraftsById] = useState<Record<string, ReleaseDraft>>({});
  const [trackDraftsById, setTrackDraftsById] = useState<Record<string, TrackDraft>>({});
  const [newTrackByReleaseId, setNewTrackByReleaseId] = useState<
    Record<string, NewTrackDraft>
  >({});
  const [previewByReleaseId, setPreviewByReleaseId] = useState<
    Record<string, ReleasePreviewDraft>
  >({});

  const [minimumPriceFloorCents, setMinimumPriceFloorCents] = useState(50);
  const [storeCurrency, setStoreCurrency] = useState("USD");
  const [stripeFeePercentBps, setStripeFeePercentBps] = useState(290);
  const [stripeFeeFixedCents, setStripeFeeFixedCents] = useState(30);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [newArtistId, setNewArtistId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCoverImageUrl, setNewCoverImageUrl] = useState("");
  const [newCoverPreviewUrl, setNewCoverPreviewUrl] = useState<string | null>(null);
  const [newCoverStorageKey, setNewCoverStorageKey] = useState<string | null>(null);
  const [localCoverPreviewById, setLocalCoverPreviewById] = useState<
    Record<string, string>
  >({});
  const [newPricingMode, setNewPricingMode] = useState<PricingMode>("FREE");
  const [newFixedPrice, setNewFixedPrice] = useState("");
  const [newMinimumPrice, setNewMinimumPrice] = useState("");
  const [newAllowFreeCheckout, setNewAllowFreeCheckout] = useState(false);
  const [newStatus, setNewStatus] = useState<ReleaseStatus>("PUBLISHED");
  const [newReleaseDate, setNewReleaseDate] = useState(getTodayDateInputValue());
  const [newMarkLossyOnly, setNewMarkLossyOnly] = useState(false);
  const [newConfirmLossyOnly, setNewConfirmLossyOnly] = useState(false);
  const [newUrlTouched, setNewUrlTouched] = useState(false);
  const [createAdvancedOpen, setCreateAdvancedOpen] = useState(false);
  const [createComposerOpen, setCreateComposerOpen] = useState(false);
  const [selectedReleaseId, setSelectedReleaseId] = useState<string | null>(null);

  const [createPending, setCreatePending] = useState(false);
  const [coverUploadTarget, setCoverUploadTarget] = useState<string | "new" | null>(null);
  const [pendingReleaseId, setPendingReleaseId] = useState<string | null>(null);
  const [pendingTrackId, setPendingTrackId] = useState<string | null>(null);
  const [pendingTrackCreateReleaseId, setPendingTrackCreateReleaseId] = useState<string | null>(
    null,
  );
  const [pendingTrackReorderReleaseId, setPendingTrackReorderReleaseId] = useState<
    string | null
  >(null);
  const [pendingPreviewApplyReleaseId, setPendingPreviewApplyReleaseId] = useState<
    string | null
  >(null);
  const [pendingTrackImportReleaseId, setPendingTrackImportReleaseId] = useState<string | null>(
    null,
  );
  const [pendingTrackUploadId, setPendingTrackUploadId] = useState<string | null>(null);
  const [trackUploadProgressById, setTrackUploadProgressById] = useState<
    Record<string, number>
  >({});
  const [trackImportJobsByReleaseId, setTrackImportJobsByReleaseId] = useState<
    Record<string, TrackImportJob[]>
  >({});
  const [trackUploadRoleById, setTrackUploadRoleById] = useState<
    Record<string, "MASTER" | "DELIVERY">
  >({});
  const [expandedTrackIdByReleaseId, setExpandedTrackIdByReleaseId] = useState<
    Record<string, string | null>
  >({});
  const [draggingTrackIdByReleaseId, setDraggingTrackIdByReleaseId] = useState<
    Record<string, string | null>
  >({});
  const [dragOverTrackIdByReleaseId, setDragOverTrackIdByReleaseId] = useState<
    Record<string, string | null>
  >({});
  const [advancedById, setAdvancedById] = useState<Record<string, boolean>>({});

  const [purgeDialogRelease, setPurgeDialogRelease] = useState<ReleaseRecord | null>(null);
  const [purgeConfirmInput, setPurgeConfirmInput] = useState("");

  const activeArtists = useMemo(
    () => artists.filter((artist) => artist.deletedAt === null),
    [artists],
  );

  const deletedCount = useMemo(
    () => releases.filter((release) => release.deletedAt !== null).length,
    [releases],
  );

  const stripeFeeEstimateConfig = useMemo(
    () => ({
      percentBps: stripeFeePercentBps,
      fixedFeeCents: stripeFeeFixedCents,
    }),
    [stripeFeePercentBps, stripeFeeFixedCents],
  );

  const trackLocalObjectUrl = useCallback((objectUrl: string) => {
    if (isBlobObjectUrl(objectUrl)) {
      localObjectUrlsRef.current.add(objectUrl);
    }
  }, []);

  const revokeLocalObjectUrl = useCallback((objectUrl: string | null | undefined) => {
    if (!isBlobObjectUrl(objectUrl)) {
      return;
    }

    if (localObjectUrlsRef.current.has(objectUrl)) {
      URL.revokeObjectURL(objectUrl);
      localObjectUrlsRef.current.delete(objectUrl);
    }
  }, []);

  const setLocalCoverPreviewForRelease = useCallback(
    (releaseId: string, objectUrl: string | null) => {
      setLocalCoverPreviewById((previous) => {
        const previousObjectUrl = previous[releaseId];
        if (previousObjectUrl && previousObjectUrl !== objectUrl) {
          revokeLocalObjectUrl(previousObjectUrl);
        }

        if (!objectUrl) {
          if (!(releaseId in previous)) {
            return previous;
          }

          const next = { ...previous };
          delete next[releaseId];
          return next;
        }

        return {
          ...previous,
          [releaseId]: objectUrl,
        };
      });
    },
    [revokeLocalObjectUrl],
  );

  useEffect(
    () => () => {
      for (const objectUrl of localObjectUrlsRef.current) {
        URL.revokeObjectURL(objectUrl);
      }
      localObjectUrlsRef.current.clear();
    },
    [],
  );

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const syncDrafts = (list: ReleaseRecord[]) => {
    setDraftsById((previous) => {
      const next: Record<string, ReleaseDraft> = {};
      for (const release of list) {
        next[release.id] = previous[release.id] ?? toReleaseDraft(release);
      }
      return next;
    });
  };

  const syncTrackDrafts = useCallback((list: ReleaseRecord[]) => {
    setTrackDraftsById((previous) => {
      const next: Record<string, TrackDraft> = {};
      for (const release of list) {
        for (const track of release.tracks) {
          next[track.id] = previous[track.id] ?? toTrackDraft(track);
        }
      }
      return next;
    });

    setNewTrackByReleaseId((previous) => {
      const next: Record<string, NewTrackDraft> = {};
      for (const release of list) {
        next[release.id] = previous[release.id] ?? toNewTrackDraft(release);
      }
      return next;
    });

    setTrackUploadRoleById((previous) => {
      const next: Record<string, "MASTER" | "DELIVERY"> = {};
      for (const release of list) {
        for (const track of release.tracks) {
          next[track.id] = previous[track.id] ?? "MASTER";
        }
      }
      return next;
    });

    setExpandedTrackIdByReleaseId((previous) => {
      const next: Record<string, string | null> = {};
      for (const release of list) {
        const previousExpanded = previous[release.id] ?? null;
        const stillExists =
          previousExpanded !== null &&
          release.tracks.some((track) => track.id === previousExpanded);
        next[release.id] = stillExists ? previousExpanded : null;
      }
      return next;
    });

    setDraggingTrackIdByReleaseId((previous) => {
      const next: Record<string, string | null> = {};
      for (const release of list) {
        next[release.id] = previous[release.id] ?? null;
      }
      return next;
    });

    setDragOverTrackIdByReleaseId((previous) => {
      const next: Record<string, string | null> = {};
      for (const release of list) {
        next[release.id] = previous[release.id] ?? null;
      }
      return next;
    });

    setPreviewByReleaseId((previous) => {
      const next: Record<string, ReleasePreviewDraft> = {};
      for (const release of list) {
        next[release.id] = previous[release.id] ?? toReleasePreviewDraft(release);
      }
      return next;
    });
  }, []);

  const loadReleases = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/releases", { method: "GET" });
      const body = (await response.json().catch(() => null)) as ReleasesListResponse | null;
      if (!response.ok || !body?.ok || !body.releases || !body.artists) {
        throw new Error(body?.error ?? "Could not load releases.");
      }

      const hydratedReleases = body.releases.map((release) =>
        withReleaseDerivedTrackStats(release),
      );
      setReleases(hydratedReleases);
      setArtists(body.artists);
      syncDrafts(hydratedReleases);
      syncTrackDrafts(hydratedReleases);
      setMinimumPriceFloorCents(body.minimumPriceFloorCents ?? 50);
      setStoreCurrency(body.storeCurrency ?? "USD");
      setStripeFeePercentBps(body.stripeFeeEstimate?.percentBps ?? 290);
      setStripeFeeFixedCents(body.stripeFeeEstimate?.fixedFeeCents ?? 30);
      const artistList = body.artists;

      setNewArtistId((current) => {
        if (current.length > 0) {
          return current;
        }

        const firstArtist = artistList.find((artist) => artist.deletedAt === null);
        return firstArtist?.id ?? current;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load releases.");
    } finally {
      setLoading(false);
    }
  }, [syncTrackDrafts]);

  useEffect(() => {
    void loadReleases();
  }, [loadReleases]);

  useEffect(() => {
    setSelectedReleaseId((current) => {
      if (releases.length === 0) {
        return null;
      }

      if (current && releases.some((release) => release.id === current)) {
        return current;
      }

      return releases[0].id;
    });
  }, [releases]);

  useEffect(() => {
    if (!loading && releases.length === 0) {
      setCreateComposerOpen(true);
    }
  }, [loading, releases.length]);

  const replaceRelease = (updated: ReleaseRecord) => {
    const normalized = withReleaseDerivedTrackStats(updated);
    setReleases((previous) =>
      previous.map((release) => (release.id === normalized.id ? normalized : release)),
    );
    setDraftsById((previous) => ({
      ...previous,
      [normalized.id]: toReleaseDraft(normalized),
    }));
    setTrackDraftsById((previous) => {
      const next = { ...previous };
      for (const track of normalized.tracks) {
        next[track.id] = previous[track.id] ?? toTrackDraft(track);
      }
      return next;
    });
    setNewTrackByReleaseId((previous) => ({
      ...previous,
      [normalized.id]: previous[normalized.id] ?? toNewTrackDraft(normalized),
    }));
    setPreviewByReleaseId((previous) => ({
      ...previous,
      [normalized.id]: previous[normalized.id] ?? toReleasePreviewDraft(normalized),
    }));
  };

  const applyTrackPatchToRelease = (releaseId: string, track: TrackRecordPatch) => {
    let nextTracksForDraftSync: TrackRecordPatch[] | null = null;

    setReleases((previous) =>
      previous.map((release) => {
        if (release.id !== releaseId) {
          return release;
        }

        const sorted = sortTracks(release.tracks);
        const existingIndex = sorted.findIndex((entry) => entry.id === track.id);
        const withoutTrack =
          existingIndex >= 0
            ? sorted.filter((entry) => entry.id !== track.id)
            : [...sorted];

        const targetIndex = Math.max(
          0,
          Math.min(withoutTrack.length, track.trackNumber - 1),
        );
        const nextTracks = [
          ...withoutTrack.slice(0, targetIndex),
          track,
          ...withoutTrack.slice(targetIndex),
        ].map((entry, index) => ({
          ...entry,
          trackNumber: index + 1,
        }));
        nextTracksForDraftSync = nextTracks;

        return withReleaseDerivedTrackStats({
          ...release,
          tracks: nextTracks,
        });
      }),
    );

    setTrackDraftsById((previous) => {
      if (!nextTracksForDraftSync) {
        return {
          ...previous,
          [track.id]: toTrackDraft(track),
        };
      }

      const next = { ...previous };
      for (const nextTrack of nextTracksForDraftSync) {
        next[nextTrack.id] = toTrackDraft(nextTrack);
      }
      return next;
    });
  };

  const uploadCoverFile = useCallback(async (file: File) => {
    const contentType = file.type.trim().toLowerCase();
    if (!ALLOWED_COVER_MIME_TYPES.has(contentType)) {
      throw new Error(
        "Unsupported cover image format. Use JPEG, PNG, WEBP, AVIF, or GIF.",
      );
    }

    const response = await fetch("/api/admin/releases/cover-upload-url", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fileName: file.name,
        contentType,
        sizeBytes: file.size,
      }),
    });
    const body = (await response.json().catch(() => null)) as CoverUploadUrlResponse | null;

    if (
      !response.ok ||
      !body?.ok ||
      !body.uploadUrl ||
      !body.publicUrl ||
      !body.storageKey
    ) {
      throw new Error(body?.error ?? "Could not prepare cover upload.");
    }

    const putResponse = await fetch(body.uploadUrl, {
      method: "PUT",
      headers: {
        ...(body.requiredHeaders ?? {}),
        "content-type": body.requiredHeaders?.["content-type"] ?? contentType,
      },
      body: file,
    });

    if (!putResponse.ok) {
      throw new Error(`Cover upload failed with status ${putResponse.status}.`);
    }

    return {
      storageKey: body.storageKey,
      publicUrl: body.publicUrl,
    };
  }, []);

  const onNewCoverFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    trackLocalObjectUrl(objectUrl);
    setNewCoverPreviewUrl((previous) => {
      if (previous && previous !== objectUrl) {
        revokeLocalObjectUrl(previous);
      }
      return objectUrl;
    });

    setError(null);
    setNotice(null);
    setCoverUploadTarget("new");

    try {
      const uploaded = await uploadCoverFile(file);
      setNewCoverStorageKey(uploaded.storageKey);
      setNewCoverImageUrl(uploaded.publicUrl);
      setNotice(`Uploaded cover artwork "${file.name}".`);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Could not upload cover artwork.",
      );
    } finally {
      setCoverUploadTarget(null);
    }
  };

  const onExistingCoverFileChange = async (
    releaseId: string,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    const draft = draftsById[releaseId];
    if (!draft) {
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    trackLocalObjectUrl(objectUrl);
    setLocalCoverPreviewForRelease(releaseId, objectUrl);

    setError(null);
    setNotice(null);
    setCoverUploadTarget(releaseId);

    try {
      const uploaded = await uploadCoverFile(file);
      setDraftsById((previous) => ({
        ...previous,
        [releaseId]: {
          ...draft,
          coverImageUrl: uploaded.publicUrl,
          coverStorageKey: uploaded.storageKey,
          removeCoverImage: false,
        },
      }));
      setNotice(`Uploaded cover artwork "${file.name}".`);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Could not upload cover artwork.",
      );
    } finally {
      setCoverUploadTarget(null);
    }
  };

  const getPricingEstimate = (draft: ReleaseDraft, currency: string) => {
    const source = draft.pricingMode === "FIXED" ? draft.fixedPrice : draft.minimumPrice;
    const grossCents = parseCurrencyInputToCents(source);

    if (draft.pricingMode === "FREE" || grossCents === null || grossCents <= 0) {
      return null;
    }

    const feeCents = estimateStripeFeeCents(grossCents, stripeFeeEstimateConfig);
    const netCents = estimateNetPayoutCents(grossCents, stripeFeeEstimateConfig);

    return {
      grossCents,
      feeCents,
      netCents,
      grossLabel: formatCurrency(grossCents, currency),
      feeLabel: formatCurrency(feeCents, currency),
      netLabel: formatCurrency(netCents, currency),
      belowFloor:
        grossCents < minimumPriceFloorCents &&
        !(draft.pricingMode === "PWYW" && draft.allowFreeCheckout && grossCents === 0),
    };
  };

  const onCreateRelease = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setCreatePending(true);

    try {
      const response = await fetch("/api/admin/releases", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          artistId: newArtistId,
          title: newTitle,
          slug: newSlug.length > 0 ? newSlug : undefined,
          description: newDescription.length > 0 ? newDescription : null,
          coverStorageKey: newCoverStorageKey,
          pricingMode: newPricingMode,
          fixedPriceCents:
            newPricingMode === "FIXED" ? parseCurrencyInputToCents(newFixedPrice) : null,
          minimumPriceCents:
            newPricingMode === "PWYW"
              ? (parseCurrencyInputToCents(newMinimumPrice) ??
                (newAllowFreeCheckout ? 0 : null))
              : null,
          allowFreeCheckout: newPricingMode === "PWYW" ? newAllowFreeCheckout : false,
          status: newStatus,
          releaseDate: newReleaseDate,
          markLossyOnly: newMarkLossyOnly,
          confirmLossyOnly: newConfirmLossyOnly,
        }),
      });
      const body = (await response.json().catch(() => null)) as ReleaseMutationResponse | null;
      if (!response.ok || !body?.ok || !body.release) {
        throw new Error(getMutationError(body, "Could not create release."));
      }

      const createdRelease = withReleaseDerivedTrackStats(body.release);
      setReleases((previous) => [createdRelease, ...previous]);
      setDraftsById((previous) => ({
        ...previous,
        [createdRelease.id]: toReleaseDraft(createdRelease),
      }));
      setNewTrackByReleaseId((previous) => ({
        ...previous,
        [createdRelease.id]: toNewTrackDraft(createdRelease),
      }));

      setNewTitle("");
      setNewSlug("");
      setNewDescription("");
      setNewCoverImageUrl("");
      setNewCoverPreviewUrl((previous) => {
        revokeLocalObjectUrl(previous);
        return null;
      });
      setNewCoverStorageKey(null);
      setNewPricingMode("FREE");
      setNewFixedPrice("");
      setNewMinimumPrice("");
      setNewAllowFreeCheckout(false);
      setNewStatus("PUBLISHED");
      setNewReleaseDate(getTodayDateInputValue());
      setNewMarkLossyOnly(false);
      setNewConfirmLossyOnly(false);
      setNewUrlTouched(false);
      setCreateAdvancedOpen(false);
      setCreateComposerOpen(false);
      setSelectedReleaseId(createdRelease.id);
      setNotice(`Created release "${createdRelease.title}".`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create release.");
    } finally {
      setCreatePending(false);
    }
  };

  const onUpdateRelease = async (releaseId: string) => {
    const draft = draftsById[releaseId];
    if (!draft) {
      return;
    }

    setError(null);
    setNotice(null);
    setPendingReleaseId(releaseId);

    try {
      const response = await fetch(`/api/admin/releases/${releaseId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "update",
          artistId: draft.artistId,
          title: draft.title,
          slug: draft.slug.length > 0 ? draft.slug : undefined,
          description: draft.description.length > 0 ? draft.description : null,
          coverStorageKey: draft.coverStorageKey,
          removeCoverImage: draft.removeCoverImage,
          pricingMode: draft.pricingMode,
          fixedPriceCents:
            draft.pricingMode === "FIXED"
              ? parseCurrencyInputToCents(draft.fixedPrice)
              : null,
          minimumPriceCents:
            draft.pricingMode === "PWYW"
              ? (parseCurrencyInputToCents(draft.minimumPrice) ??
                (draft.allowFreeCheckout ? 0 : null))
              : null,
          allowFreeCheckout: draft.pricingMode === "PWYW" ? draft.allowFreeCheckout : false,
          status: draft.status,
          releaseDate: draft.releaseDate,
          markLossyOnly: draft.markLossyOnly,
          confirmLossyOnly: draft.confirmLossyOnly,
        }),
      });
      const body = (await response.json().catch(() => null)) as ReleaseMutationResponse | null;
      if (!response.ok || !body?.ok || !body.release) {
        throw new Error(getMutationError(body, "Could not update release."));
      }

      replaceRelease(body.release);
      setNotice(`Saved "${body.release.title}".`);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update release.");
    } finally {
      setPendingReleaseId(null);
    }
  };

  const onSoftDeleteOrRestoreRelease = async (release: ReleaseRecord) => {
    setError(null);
    setNotice(null);
    setPendingReleaseId(release.id);

    try {
      const action = release.deletedAt ? "restore" : "soft-delete";
      const response = await fetch(`/api/admin/releases/${release.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = (await response.json().catch(() => null)) as ReleaseMutationResponse | null;
      if (!response.ok || !body?.ok || !body.release) {
        throw new Error(
          getMutationError(
            body,
            action === "restore" ? "Could not restore release." : "Could not delete release.",
          ),
        );
      }

      replaceRelease(body.release);
      setNotice(
        action === "restore"
          ? `Restored "${body.release.title}".`
          : `Soft-deleted "${body.release.title}".`,
      );
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not change release status.");
    } finally {
      setPendingReleaseId(null);
    }
  };

  const onPurgeRelease = async (release: ReleaseRecord, confirmTitle: string) => {
    setError(null);
    setNotice(null);
    setPendingReleaseId(release.id);

    try {
      const response = await fetch(`/api/admin/releases/${release.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "purge",
          confirmTitle,
        }),
      });

      const body = (await response.json().catch(() => null)) as ReleaseMutationResponse | null;
      if (!response.ok || !body?.ok || !body.release) {
        throw new Error(getMutationError(body, "Could not purge release assets."));
      }

      replaceRelease(body.release);
      setNotice(
        `Purged ${body.purgedAssetCount ?? 0} storage asset${body.purgedAssetCount === 1 ? "" : "s"} for "${release.title}".`,
      );
      setPurgeDialogRelease(null);
      setPurgeConfirmInput("");
    } catch (purgeError) {
      setError(
        purgeError instanceof Error ? purgeError.message : "Could not purge release assets.",
      );
    } finally {
      setPendingReleaseId(null);
    }
  };

  const onHardDeleteRelease = async (release: ReleaseRecord, confirmTitle: string) => {
    setError(null);
    setNotice(null);
    setPendingReleaseId(release.id);

    try {
      const response = await fetch(`/api/admin/releases/${release.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "hard-delete",
          confirmTitle,
        }),
      });

      const body = (await response.json().catch(() => null)) as ReleaseMutationResponse | null;
      if (!response.ok || !body?.ok || !body.hardDeletedReleaseId) {
        throw new Error(getMutationError(body, "Could not fully delete release."));
      }
      const hardDeletedReleaseId = body.hardDeletedReleaseId;

      setReleases((previous) => previous.filter((entry) => entry.id !== hardDeletedReleaseId));
      setDraftsById((previous) => {
        const next = { ...previous };
        delete next[hardDeletedReleaseId];
        return next;
      });
      setNewTrackByReleaseId((previous) => {
        const next = { ...previous };
        delete next[hardDeletedReleaseId];
        return next;
      });
      setTrackDraftsById((previous) => {
        const next = { ...previous };
        for (const track of release.tracks) {
          delete next[track.id];
        }
        return next;
      });
      setTrackImportJobsByReleaseId((previous) => {
        const next = { ...previous };
        delete next[hardDeletedReleaseId];
        return next;
      });
      setExpandedTrackIdByReleaseId((previous) => {
        const next = { ...previous };
        delete next[hardDeletedReleaseId];
        return next;
      });
      setDraggingTrackIdByReleaseId((previous) => {
        const next = { ...previous };
        delete next[hardDeletedReleaseId];
        return next;
      });
      setDragOverTrackIdByReleaseId((previous) => {
        const next = { ...previous };
        delete next[hardDeletedReleaseId];
        return next;
      });
      setPreviewByReleaseId((previous) => {
        const next = { ...previous };
        delete next[hardDeletedReleaseId];
        return next;
      });
      setNotice(
        `Fully deleted "${release.title}" and removed ${body.purgedAssetCount ?? 0} storage asset${body.purgedAssetCount === 1 ? "" : "s"}.`,
      );
      setPurgeDialogRelease(null);
      setPurgeConfirmInput("");
    } catch (hardDeleteError) {
      setError(
        hardDeleteError instanceof Error
          ? hardDeleteError.message
          : "Could not fully delete release.",
      );
    } finally {
      setPendingReleaseId(null);
    }
  };

  const setTrackImportJobStatus = (
    releaseId: string,
    jobId: string,
    status: TrackImportStatus,
    error: string | null = null,
  ) => {
    setTrackImportJobsByReleaseId((previous) => {
      const jobs = previous[releaseId] ?? [];
      return {
        ...previous,
        [releaseId]: jobs.map((job) =>
          job.id === jobId
            ? {
                ...job,
                status,
                error,
              }
            : job,
        ),
      };
    });
  };

  const createTrackForRelease = async (input: {
    releaseId: string;
    title: string;
    trackNumber?: number;
    durationMs?: number | null;
    previewMode: PreviewMode;
    previewSeconds: number | null;
  }) => {
    const response = await fetch(`/api/admin/releases/${input.releaseId}/tracks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: input.title,
        trackNumber: input.trackNumber,
        durationMs: input.durationMs,
        previewMode: input.previewMode,
        previewSeconds: input.previewSeconds,
      }),
    });
    const body = (await response.json().catch(() => null)) as TrackMutationResponse | null;
    if (!response.ok || !body?.ok || !body.track) {
      throw new Error(body?.error ?? "Could not create track.");
    }

    return body.track;
  };

  const deleteTrackForRelease = async (input: { releaseId: string; trackId: string }) => {
    const response = await fetch(
      `/api/admin/releases/${input.releaseId}/tracks/${input.trackId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "delete",
        }),
      },
    );

    const body = (await response.json().catch(() => null)) as TrackMutationResponse | null;
    if (!response.ok || !body?.ok || !body.deletedTrackId) {
      throw new Error(body?.error ?? "Could not delete track.");
    }
  };

  const updateTrackMetadataFromAudio = async (input: {
    releaseId: string;
    trackId: string;
    title: string;
    durationMs: number | null;
  }) => {
    const response = await fetch(
      `/api/admin/releases/${input.releaseId}/tracks/${input.trackId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "update",
          title: input.title,
          durationMs: input.durationMs,
        }),
      },
    );

    const body = (await response.json().catch(() => null)) as TrackMutationResponse | null;
    if (!response.ok || !body?.ok || !body.track) {
      throw new Error(body?.error ?? "Could not sync track metadata.");
    }

    return body.track;
  };

  const uploadTrackAsset = async (input: {
    releaseId: string;
    trackId: string;
    file: File;
    contentType: string;
    assetRole: "MASTER" | "DELIVERY";
    onProgress?: (percent: number) => void;
  }) => {
    const uploadUrlResponse = await fetch("/api/admin/upload/upload-url", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fileName: input.file.name,
        contentType: input.contentType,
        sizeBytes: input.file.size,
      }),
    });
    const uploadUrlBody = (await uploadUrlResponse
      .json()
      .catch(() => null)) as UploadUrlResponse | null;

    if (
      !uploadUrlResponse.ok ||
      !uploadUrlBody?.ok ||
      !uploadUrlBody.uploadUrl ||
      !uploadUrlBody.storageKey ||
      !uploadUrlBody.bucket ||
      !uploadUrlBody.storageProvider
    ) {
      throw new Error(uploadUrlBody?.error ?? "Could not create upload URL.");
    }

    await uploadViaSignedPut({
      uploadUrl: uploadUrlBody.uploadUrl,
      file: input.file,
      contentType: input.contentType,
      requiredHeaders: uploadUrlBody.requiredHeaders ?? {},
      onProgress: (percent) => {
        input.onProgress?.(percent);
      },
    });

    const commitResponse = await fetch("/api/admin/upload/track-assets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        releaseId: input.releaseId,
        trackId: input.trackId,
        fileName: input.file.name,
        storageKey: uploadUrlBody.storageKey,
        contentType: input.contentType,
        sizeBytes: input.file.size,
        assetRole: input.assetRole,
      }),
    });
    const commitBody = (await commitResponse
      .json()
      .catch(() => null)) as TrackAssetCommitResponse | null;
    if (!commitResponse.ok || !commitBody?.ok) {
      throw new Error(commitBody?.error ?? "Could not attach uploaded asset to this track.");
    }

    return commitBody;
  };

  const onImportTrackFiles = async (
    release: ReleaseRecord,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (selectedFiles.length === 0) {
      return;
    }

    if (
      pendingPreviewApplyReleaseId ||
      pendingTrackImportReleaseId ||
      pendingTrackUploadId ||
      pendingTrackId ||
      pendingReleaseId ||
      createPending
    ) {
      return;
    }

    const prepared = selectedFiles.map((file) => {
      const contentType = resolveAudioMimeType(file);
      return {
        file,
        contentType,
      };
    });

    const unsupported = prepared.find(
      (entry) => !ALLOWED_AUDIO_MIME_TYPES.has(entry.contentType),
    );
    if (unsupported) {
      setError(
        `${unsupported.file.name}: unsupported file type (${unsupported.contentType || "unknown"}).`,
      );
      return;
    }

    let mode: TrackImportMode = "append";
    if (release.tracks.length > 0) {
      const replaceSelected = window.confirm(
        `Import mode for "${release.title}": press OK to REPLACE existing tracks, or Cancel to APPEND.`,
      );
      if (replaceSelected) {
        const confirmed = window.confirm(
          `Replace will permanently delete ${release.tracks.length} existing track${release.tracks.length === 1 ? "" : "s"} and their linked assets/jobs. Continue?`,
        );
        if (!confirmed) {
          return;
        }

        mode = "replace";
      }
    }

    setError(null);
    setNotice(null);
    setPendingTrackImportReleaseId(release.id);

    try {
      const previewDraft = previewByReleaseId[release.id] ?? toReleasePreviewDraft(release);
      const previewPayload = resolvePreviewPayload(previewDraft);
      const parsedMetadata = await Promise.all(
        prepared.map(async (entry) => ({
          file: entry.file,
          contentType: entry.contentType,
          metadata: await parseTrackImportFileMetadata(entry.file),
        })),
      );

      const orderedCandidates = resolveTrackImportOrder(
        parsedMetadata.map((entry, index) => ({
          id: index,
          fileName: entry.metadata.fileName,
          metadataTrackNumber: entry.metadata.metadataTrackNumber,
        })),
      );

      const orderedMetadata = orderedCandidates.map((candidate) => parsedMetadata[candidate.id]);
      const startTrackNumber = mode === "replace" ? 1 : release.tracks.length + 1;
      const plannedImports: PlannedTrackImport[] = assignSequentialTrackNumbers(
        orderedMetadata,
        startTrackNumber,
      ).map((assignment, index) => ({
        id: `${Date.now()}-${index}-${assignment.item.file.name}`,
        file: assignment.item.file,
        fileName: assignment.item.file.name,
        contentType: assignment.item.contentType,
        metadata: assignment.item.metadata,
        trackNumber: assignment.trackNumber,
      }));

      setTrackImportJobsByReleaseId((previous) => ({
        ...previous,
        [release.id]: plannedImports.map((entry) => ({
          id: entry.id,
          fileName: entry.fileName,
          title: entry.metadata.resolvedTitle,
          plannedTrackNumber: entry.trackNumber,
          durationMs: entry.metadata.durationMs,
          status: "pending",
          error: null,
        })),
      }));

      if (mode === "replace") {
        const existingTracks = sortTracks(release.tracks);
        for (const track of existingTracks) {
          await deleteTrackForRelease({
            releaseId: release.id,
            trackId: track.id,
          });
        }
      }

      let completed = 0;
      let failed = 0;
      let previewQueuedCount = 0;

      for (const plannedImport of plannedImports) {
        try {
          const createdTrack = await createTrackForRelease({
            releaseId: release.id,
            title: plannedImport.metadata.resolvedTitle,
            trackNumber: plannedImport.trackNumber,
            durationMs: plannedImport.metadata.durationMs,
            previewMode: previewPayload.previewMode,
            previewSeconds: previewPayload.previewSeconds,
          });

          setTrackImportJobStatus(release.id, plannedImport.id, "track-created");

          const commit = await uploadTrackAsset({
            releaseId: release.id,
            trackId: createdTrack.id,
            file: plannedImport.file,
            contentType: plannedImport.contentType,
            assetRole: "MASTER",
          });

          if (commit.previewJobQueued) {
            previewQueuedCount += 1;
          }

          // Always refresh title/duration from uploaded file metadata.
          await updateTrackMetadataFromAudio({
            releaseId: release.id,
            trackId: createdTrack.id,
            title: plannedImport.metadata.resolvedTitle,
            durationMs: plannedImport.metadata.durationMs,
          });

          setTrackImportJobStatus(release.id, plannedImport.id, "uploaded");
          completed += 1;
        } catch (importError) {
          setTrackImportJobStatus(
            release.id,
            plannedImport.id,
            "failed",
            importError instanceof Error ? importError.message : "Import failed.",
          );
          failed += 1;
        }
      }

      await loadReleases();
      setNotice(
        `Imported ${completed}/${plannedImports.length} track${plannedImports.length === 1 ? "" : "s"} for "${release.title}".${
          previewQueuedCount > 0 ? ` Preview jobs queued: ${previewQueuedCount}.` : ""
        }`,
      );

      if (failed > 0) {
        setError(`${failed} import job${failed === 1 ? "" : "s"} failed. See status list below.`);
      }
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Could not import tracks.");
    } finally {
      setPendingTrackImportReleaseId(null);
    }
  };

  const onApplyReleasePreviewToTracks = async (
    release: ReleaseRecord,
    previewDraftOverride?: ReleasePreviewDraft,
    options?: { silent?: boolean },
  ) => {
    const previewDraft =
      previewDraftOverride ?? previewByReleaseId[release.id] ?? toReleasePreviewDraft(release);
    const previewPayload = resolvePreviewPayload(previewDraft);
    const tracks = sortTracks(release.tracks);

    if (tracks.length === 0) {
      return;
    }

    if (!options?.silent) {
      setError(null);
      setNotice(null);
    }
    setPendingPreviewApplyReleaseId(release.id);

    try {
      const updatedTracks: TrackRecordPatch[] = [];
      for (const track of tracks) {
        const response = await fetch(`/api/admin/releases/${release.id}/tracks/${track.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "update",
            previewMode: previewPayload.previewMode,
            previewSeconds: previewPayload.previewSeconds,
          }),
        });
        const body = (await response.json().catch(() => null)) as TrackMutationResponse | null;
        if (!response.ok || !body?.ok || !body.track) {
          throw new Error(body?.error ?? `Could not apply preview settings to "${track.title}".`);
        }

        updatedTracks.push(body.track);
      }

      if (updatedTracks.length > 0) {
        setReleases((previous) =>
          previous.map((entry) => {
            if (entry.id !== release.id) {
              return entry;
            }

            const byId = new Map(updatedTracks.map((track) => [track.id, track]));
            const merged = entry.tracks.map((track) => byId.get(track.id) ?? track);
            return withReleaseDerivedTrackStats({
              ...entry,
              tracks: merged,
            });
          }),
        );

        setTrackDraftsById((previous) => {
          const next = { ...previous };
          for (const track of updatedTracks) {
            next[track.id] = toTrackDraft(track);
          }
          return next;
        });
      }
      if (!options?.silent) {
        setNotice(
          `Applied release preview settings to ${tracks.length} track${tracks.length === 1 ? "" : "s"}.`,
        );
      }
    } catch (previewError) {
      setError(
        previewError instanceof Error
          ? previewError.message
          : "Could not apply release preview settings.",
      );
    } finally {
      setPendingPreviewApplyReleaseId(null);
    }
  };

  const onCreateTrack = async (release: ReleaseRecord) => {
    const draft = newTrackByReleaseId[release.id] ?? toNewTrackDraft(release);
    const previewDraft = previewByReleaseId[release.id] ?? toReleasePreviewDraft(release);
    const previewPayload = resolvePreviewPayload(previewDraft);
    if (draft.title.trim().length === 0) {
      setError("Track title is required.");
      return;
    }

    setError(null);
    setNotice(null);
    setPendingTrackCreateReleaseId(release.id);

    try {
      const response = await fetch(`/api/admin/releases/${release.id}/tracks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          trackNumber: parsePositiveInteger(draft.trackNumber) ?? undefined,
          lyrics: draft.lyrics.trim().length > 0 ? draft.lyrics : null,
          credits: draft.credits.trim().length > 0 ? draft.credits : null,
          previewMode: previewPayload.previewMode,
          previewSeconds: previewPayload.previewSeconds,
        }),
      });
      const body = (await response.json().catch(() => null)) as TrackMutationResponse | null;
      if (!response.ok || !body?.ok || !body.track) {
        throw new Error(body?.error ?? "Could not create track.");
      }

      setTrackDraftsById((previous) => ({
        ...previous,
        [body.track!.id]: toTrackDraft(body.track!),
      }));
      setNewTrackByReleaseId((previous) => ({
        ...previous,
        [release.id]: {
          ...previous[release.id],
          title: "",
          trackNumber: "",
          lyrics: "",
          credits: "",
        },
      }));
      setExpandedTrackIdByReleaseId((previous) => ({
        ...previous,
        [release.id]: body.track!.id,
      }));
      await loadReleases();
      setNotice(`Added track "${body.track.title}".`);
    } catch (trackError) {
      setError(trackError instanceof Error ? trackError.message : "Could not create track.");
    } finally {
      setPendingTrackCreateReleaseId(null);
    }
  };

  const onUpdateTrack = async (releaseId: string, trackId: string) => {
    const draft = trackDraftsById[trackId];
    if (!draft) {
      return;
    }

    if (draft.title.trim().length === 0) {
      setError("Track title is required.");
      return;
    }

    setError(null);
    setNotice(null);
    setPendingTrackId(trackId);

    try {
      const response = await fetch(`/api/admin/releases/${releaseId}/tracks/${trackId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "update",
          title: draft.title,
          trackNumber: parsePositiveInteger(draft.trackNumber) ?? undefined,
          lyrics: draft.lyrics.trim().length > 0 ? draft.lyrics : null,
          credits: draft.credits.trim().length > 0 ? draft.credits : null,
        }),
      });
      const body = (await response.json().catch(() => null)) as TrackMutationResponse | null;
      if (!response.ok || !body?.ok || !body.track) {
        throw new Error(body?.error ?? "Could not save track.");
      }

      applyTrackPatchToRelease(releaseId, body.track);
      setNotice(`Saved track "${body.track.title}".`);
    } catch (trackError) {
      setError(trackError instanceof Error ? trackError.message : "Could not save track.");
    } finally {
      setPendingTrackId(null);
    }
  };

  const onReorderTrackDrop = async (release: ReleaseRecord, targetTrackId: string) => {
    const draggedTrackId = draggingTrackIdByReleaseId[release.id] ?? null;
    if (!draggedTrackId || draggedTrackId === targetTrackId) {
      setDragOverTrackIdByReleaseId((previous) => ({
        ...previous,
        [release.id]: null,
      }));
      setDraggingTrackIdByReleaseId((previous) => ({
        ...previous,
        [release.id]: null,
      }));
      return;
    }

    if (
      pendingTrackReorderReleaseId ||
      pendingPreviewApplyReleaseId ||
      pendingTrackImportReleaseId ||
      pendingTrackUploadId ||
      pendingTrackId ||
      pendingReleaseId ||
      createPending
    ) {
      return;
    }

    const current = sortTracks(release.tracks);
    const fromIndex = current.findIndex((track) => track.id === draggedTrackId);
    const toIndex = current.findIndex((track) => track.id === targetTrackId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
      setDragOverTrackIdByReleaseId((previous) => ({
        ...previous,
        [release.id]: null,
      }));
      setDraggingTrackIdByReleaseId((previous) => ({
        ...previous,
        [release.id]: null,
      }));
      return;
    }

    const reordered = moveItemInArray(current, fromIndex, toIndex).map((track, index) => ({
      ...track,
      trackNumber: index + 1,
    }));

    // Optimistic local reorder to keep drag UX responsive.
    setReleases((previous) =>
      previous.map((entry) =>
        entry.id === release.id
          ? withReleaseDerivedTrackStats({
              ...entry,
              tracks: reordered,
            })
          : entry,
      ),
    );

    setTrackDraftsById((previous) => {
      const next = { ...previous };
      for (const track of reordered) {
        const existing = next[track.id] ?? toTrackDraft(track);
        next[track.id] = {
          ...existing,
          trackNumber: String(track.trackNumber),
        };
      }
      return next;
    });

    setPendingTrackReorderReleaseId(release.id);
    setError(null);
    setNotice(null);

    try {
      const updatedTracks: TrackRecordPatch[] = [];
      for (const track of reordered) {
        const response = await fetch(
          `/api/admin/releases/${release.id}/tracks/${track.id}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              action: "update",
              trackNumber: track.trackNumber,
            }),
          },
        );
        const body = (await response.json().catch(() => null)) as TrackMutationResponse | null;
        if (!response.ok || !body?.ok || !body.track) {
          throw new Error(body?.error ?? `Could not reorder "${track.title}".`);
        }
        updatedTracks.push(body.track);
      }

      if (updatedTracks.length > 0) {
        setReleases((previous) =>
          previous.map((entry) => {
            if (entry.id !== release.id) {
              return entry;
            }

            const byId = new Map(updatedTracks.map((track) => [track.id, track]));
            const merged = entry.tracks.map((track) => byId.get(track.id) ?? track);
            return withReleaseDerivedTrackStats({
              ...entry,
              tracks: merged,
            });
          }),
        );

        setTrackDraftsById((previous) => {
          const next = { ...previous };
          for (const track of updatedTracks) {
            next[track.id] = toTrackDraft(track);
          }
          return next;
        });
      }

      setNotice("Track order updated.");
    } catch (reorderError) {
      setError(reorderError instanceof Error ? reorderError.message : "Could not reorder tracks.");
      await loadReleases();
    } finally {
      setPendingTrackReorderReleaseId(null);
      setDragOverTrackIdByReleaseId((previous) => ({
        ...previous,
        [release.id]: null,
      }));
      setDraggingTrackIdByReleaseId((previous) => ({
        ...previous,
        [release.id]: null,
      }));
    }
  };

  const onDeleteTrack = async (releaseId: string, track: TrackRecord) => {
    setError(null);
    setNotice(null);
    setPendingTrackId(track.id);

    try {
      const response = await fetch(`/api/admin/releases/${releaseId}/tracks/${track.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "delete",
        }),
      });
      const body = (await response.json().catch(() => null)) as TrackMutationResponse | null;
      if (!response.ok || !body?.ok || !body.deletedTrackId) {
        throw new Error(body?.error ?? "Could not delete track.");
      }

      await loadReleases();
      setNotice(`Deleted track "${track.title}".`);
    } catch (trackError) {
      setError(trackError instanceof Error ? trackError.message : "Could not delete track.");
    } finally {
      setPendingTrackId(null);
    }
  };

  const onInlineTrackFileChange = async (
    releaseId: string,
    track: TrackRecord,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    if (
      pendingPreviewApplyReleaseId ||
      pendingTrackImportReleaseId ||
      pendingTrackUploadId ||
      pendingTrackId ||
      pendingReleaseId ||
      createPending
    ) {
      return;
    }

    const uploadRole = trackUploadRoleById[track.id] ?? "MASTER";
    const contentType = resolveAudioMimeType(file);
    if (!ALLOWED_AUDIO_MIME_TYPES.has(contentType)) {
      setError(
        `${file.name}: unsupported file type (${contentType || "unknown"}).`,
      );
      return;
    }

    setError(null);
    setNotice(null);
    setPendingTrackUploadId(track.id);
    setTrackUploadProgressById((previous) => ({
      ...previous,
      [track.id]: 0,
    }));

    try {
      const metadata = await parseTrackImportFileMetadata(file);
      const commitBody = await uploadTrackAsset({
        releaseId,
        trackId: track.id,
        file,
        contentType,
        assetRole: uploadRole,
        onProgress: (percent) =>
          setTrackUploadProgressById((previous) => ({
            ...previous,
            [track.id]: percent,
          })),
      });

      await updateTrackMetadataFromAudio({
        releaseId,
        trackId: track.id,
        title: metadata.resolvedTitle,
        durationMs: metadata.durationMs,
      });

      await loadReleases();
      setNotice(
        `Uploaded "${file.name}" as ${uploadRole.toLowerCase()} for "${track.title}" (synced metadata to "${metadata.resolvedTitle}", ${formatTrackDuration(metadata.durationMs)}).${
          commitBody.previewJobQueued ? " Preview job queued." : ""
        }`,
      );
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Could not upload track asset.",
      );
    } finally {
      setPendingTrackUploadId(null);
      setTrackUploadProgressById((previous) => {
        const next = { ...previous };
        delete next[track.id];
        return next;
      });
    }
  };

  const renderPricingDetails = (draft: ReleaseDraft, currency: string) => {
    if (draft.pricingMode === "FREE") {
      return (
        <p className="mt-2 text-xs text-zinc-500">
          Free release. Stripe is bypassed and no minimum floor applies.
        </p>
      );
    }

    const estimate = getPricingEstimate(draft, currency);

    return (
      <>
        <p className="mt-2 text-xs text-zinc-500">
          Minimum system floor:{" "}
          {draft.pricingMode === "PWYW" && draft.allowFreeCheckout
            ? `${formatCurrency(0, currency)} (free checkout enabled) or ${formatCurrency(minimumPriceFloorCents, currency)}+`
            : formatCurrency(minimumPriceFloorCents, currency)}
          .
        </p>
        {estimate ? (
          <p className="mt-1 text-xs text-zinc-400">
            At {estimate.grossLabel}, Stripe fees are ~{estimate.feeLabel} and payout is ~
            {estimate.netLabel}.
          </p>
        ) : draft.pricingMode === "PWYW" && draft.allowFreeCheckout ? (
          <p className="mt-1 text-xs text-zinc-400">
            Free checkout is enabled. Buyers can check out at{" "}
            {formatCurrency(0, currency)}.
          </p>
        ) : (
          <p className="mt-1 text-xs text-zinc-500">
            Enter a price to preview Stripe fee and net payout.
          </p>
        )}
        {estimate?.belowFloor ? (
          <p className="mt-2 rounded-lg border border-amber-700/60 bg-amber-950/40 px-3 py-2 text-xs text-amber-300">
            Price is below the minimum floor of {formatCurrency(minimumPriceFloorCents, currency)}.
          </p>
        ) : null}
      </>
    );
  };

  const newCoverPreviewSrc = newCoverPreviewUrl ?? newCoverImageUrl;

  if (!isHydrated) {
    return (
      <section className="mt-8 rounded-2xl border border-slate-700/90 bg-slate-950/50 p-5 sm:p-6">
        <p className="text-sm text-zinc-500">Loading release management…</p>
      </section>
    );
  }

  return (
    <section className="mt-8 rounded-2xl border border-slate-700/90 bg-slate-950/50 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold tracking-tight text-zinc-100">Release Management</h2>
        <p className="text-xs text-zinc-500">
          {releases.length} total, {deletedCount} deleted
        </p>
      </div>

      <p className="mt-2 text-sm text-zinc-500">
        Create releases, configure pricing, disclose lossy-only quality, and manage soft delete,
        restore, and permanent asset purge.
      </p>

      <div className="mt-5">
        <p className="text-xs uppercase tracking-wide text-zinc-500">Releases</p>
        <div className="mt-2 flex gap-3 overflow-x-auto pb-2">
          <button
            type="button"
            onClick={() => setCreateComposerOpen(true)}
            className="flex h-32 w-32 shrink-0 flex-col items-center justify-center rounded-xl border border-dashed border-slate-600 bg-slate-900/60 text-zinc-300 transition hover:border-slate-400 hover:text-zinc-100"
            aria-label="Create new release"
          >
            <span className="text-2xl leading-none">+</span>
            <span className="mt-2 text-xs font-medium">Create</span>
          </button>

          {releases.map((release) => {
            const isSelected = selectedReleaseId === release.id;
            const cardCoverPreviewSrc =
              localCoverPreviewById[release.id] ??
              draftsById[release.id]?.coverImageUrl ??
              release.coverImageUrl;
            const cardDisplaySrc = cardCoverPreviewSrc
              ? toCoverDisplaySrc(cardCoverPreviewSrc)
              : "";

            return (
              <button
                key={release.id}
                type="button"
                onClick={() => {
                  setSelectedReleaseId(release.id);
                  setCreateComposerOpen(false);
                }}
                className={`group flex h-32 w-32 shrink-0 flex-col overflow-hidden rounded-xl border text-left transition ${
                  isSelected
                    ? "border-emerald-500/70 bg-emerald-950/30"
                    : "border-slate-700 bg-slate-900/50 hover:border-slate-500"
                }`}
                aria-pressed={isSelected}
                aria-label={`Select release ${release.title}`}
              >
                {cardDisplaySrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={cardDisplaySrc}
                    alt={`${release.title} cover`}
                    className="h-20 w-full object-cover"
                  />
                ) : (
                  <div className="flex h-20 w-full items-center justify-center bg-slate-800 text-[11px] text-zinc-500">
                    no artwork
                  </div>
                )}

                <div className="flex min-h-0 flex-1 items-center justify-between gap-2 px-2 py-1.5">
                  <p className="line-clamp-2 text-xs font-medium text-zinc-200">{release.title}</p>
                  {release.deletedAt ? (
                    <span className="shrink-0 rounded-full border border-amber-700/70 bg-amber-950/50 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                      del
                    </span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {createComposerOpen ? (
      <form onSubmit={onCreateRelease} className="mt-5 rounded-xl border border-slate-700 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-zinc-200">Create release</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCreateAdvancedOpen((previous) => !previous)}
              className={buttonClassName}
            >
              {createAdvancedOpen ? "Hide Advanced" : "Advanced"}
            </button>
            <button
              type="button"
              onClick={() => setCreateComposerOpen(false)}
              className={buttonClassName}
            >
              Close
            </button>
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-zinc-500 sm:col-span-2">
            Artist (required)
            <select
              required
              value={newArtistId}
              onChange={(event) => setNewArtistId(event.target.value)}
              className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
            >
              <option value="" disabled>
                Select artist
              </option>
              {artists.map((artist) => (
                <option key={artist.id} value={artist.id} disabled={artist.deletedAt !== null}>
                  {artist.name}
                  {artist.deletedAt ? " (deleted)" : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-zinc-500 sm:col-span-2">
            Title (required)
            <input
              required
              maxLength={160}
              value={newTitle}
              onChange={(event) => {
                const value = event.target.value;
                setNewTitle(value);
                if (!newUrlTouched) {
                  setNewSlug(slugify(value));
                }
              }}
              className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
              placeholder="Release title"
            />
          </label>

          {createAdvancedOpen ? (
            <label className="flex flex-col gap-1 text-xs text-zinc-500 sm:col-span-2">
              URL
              <input
                maxLength={160}
                value={newSlug}
                onChange={(event) => {
                  setNewSlug(sanitizeUrlInput(event.target.value));
                  setNewUrlTouched(true);
                }}
                className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
                placeholder="release-title"
              />
              <span className="text-[11px] text-zinc-500">
                Preview: {getReleaseUrlPreview(newTitle, newSlug)}
              </span>
            </label>
          ) : null}

          <label className="flex flex-col gap-1 text-xs text-zinc-500 sm:col-span-2">
            Description
            <textarea
              rows={3}
              maxLength={4_000}
              value={newDescription}
              onChange={(event) => setNewDescription(event.target.value)}
              className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
              placeholder="Optional release description"
            />
          </label>

          <div className="rounded-lg border border-slate-700/80 bg-slate-900/50 p-3 text-xs text-zinc-400 sm:col-span-2">
            <p className="font-medium text-zinc-300">Cover artwork</p>
            <p className="mt-1">
              Upload square artwork for this release. JPEG, PNG, WEBP, AVIF, and GIF are supported.
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label className={buttonClassName}>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
                  className="hidden"
                  onChange={(event) => void onNewCoverFileChange(event)}
                  disabled={createPending || coverUploadTarget === "new"}
                />
                {coverUploadTarget === "new" ? "Uploading..." : "Upload Cover"}
              </label>

              <button
                type="button"
                className={buttonClassName}
                disabled={
                  createPending ||
                  coverUploadTarget === "new" ||
                  (newCoverImageUrl.length === 0 && newCoverStorageKey === null)
                }
                onClick={() => {
                  setNewCoverImageUrl("");
                  setNewCoverPreviewUrl((previous) => {
                    revokeLocalObjectUrl(previous);
                    return null;
                  });
                  setNewCoverStorageKey(null);
                }}
              >
                Remove Cover
              </button>
            </div>

            {newCoverPreviewSrc ? (
              <div className="mt-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={toCoverDisplaySrc(newCoverPreviewSrc)}
                  alt="New release cover preview"
                  className="h-28 w-28 rounded-lg border border-slate-700 object-cover"
                />
              </div>
            ) : (
              <p className="mt-3 text-xs text-zinc-500">No cover uploaded yet.</p>
            )}
          </div>

          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            Pricing mode
            <select
              value={newPricingMode}
              onChange={(event) => {
                const mode = event.target.value as PricingMode;
                setNewPricingMode(mode);
                if (mode !== "PWYW") {
                  setNewAllowFreeCheckout(false);
                }
              }}
              className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
            >
              {pricingModeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            Status
            <select
              value={newStatus}
              onChange={(event) => setNewStatus(event.target.value as ReleaseStatus)}
              className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            Release date
            <input
              type="date"
              required
              value={newReleaseDate}
              onChange={(event) => setNewReleaseDate(event.target.value)}
              className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
            />
          </label>

          {newPricingMode === "FIXED" ? (
            <label className="flex flex-col gap-1 text-xs text-zinc-500 sm:col-span-2">
              Fixed price ({storeCurrency})
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={newFixedPrice}
                onChange={(event) => setNewFixedPrice(event.target.value)}
                className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
                placeholder="5.00"
              />
            </label>
          ) : null}

          {newPricingMode === "PWYW" ? (
            <div className="flex flex-col gap-2 text-xs text-zinc-500 sm:col-span-2">
              <label className="flex flex-col gap-1">
                PWYW minimum ({storeCurrency})
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={newMinimumPrice}
                  onChange={(event) => setNewMinimumPrice(event.target.value)}
                  className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
                  placeholder={newAllowFreeCheckout ? "0.00" : "2.00"}
                />
              </label>
              <label className="inline-flex items-center gap-2 text-zinc-300">
                <input
                  type="checkbox"
                  checked={newAllowFreeCheckout}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setNewAllowFreeCheckout(checked);
                    if (checked && newMinimumPrice.trim().length === 0) {
                      setNewMinimumPrice("0.00");
                    }
                  }}
                />
                Allow free checkout ($0)
              </label>
            </div>
          ) : null}

          <div className="rounded-lg border border-slate-700/80 bg-slate-900/50 p-3 text-xs text-zinc-400 sm:col-span-2">
            <p className="font-medium text-zinc-300">Pricing estimate</p>
            {renderPricingDetails(
              {
                artistId: newArtistId,
                title: newTitle,
                slug: newSlug,
                description: newDescription,
                coverImageUrl: newCoverImageUrl,
                coverStorageKey: newCoverStorageKey,
                removeCoverImage: false,
                pricingMode: newPricingMode,
                fixedPrice: newFixedPrice,
                minimumPrice: newMinimumPrice,
                allowFreeCheckout: newAllowFreeCheckout,
                status: newStatus,
                releaseDate: newReleaseDate,
                markLossyOnly: newMarkLossyOnly,
                confirmLossyOnly: newConfirmLossyOnly,
              },
              storeCurrency,
            )}
          </div>

          <div className="rounded-lg border border-slate-700/80 bg-slate-900/50 p-3 text-xs text-zinc-400 sm:col-span-2">
            <p className="font-medium text-zinc-300">Master quality workflow</p>
            <p className="mt-1">
              Upload lossless masters first when possible. If you only have lossy files, mark this
              release as lossy-only and confirm disclosure.
            </p>

            <div className="mt-3 flex flex-col gap-2">
              <label className="inline-flex items-start gap-2">
                <input
                  type="radio"
                  name="new-lossless"
                  checked={!newMarkLossyOnly}
                  onChange={() => {
                    setNewMarkLossyOnly(false);
                    setNewConfirmLossyOnly(false);
                  }}
                  className="mt-0.5"
                />
                <span className="text-zinc-300">Lossless masters available</span>
              </label>
              <label className="inline-flex items-start gap-2">
                <input
                  type="radio"
                  name="new-lossless"
                  checked={newMarkLossyOnly}
                  onChange={() => {
                    setNewMarkLossyOnly(true);
                    setNewConfirmLossyOnly(false);
                  }}
                  className="mt-0.5"
                />
                <span className="text-zinc-300">Lossy-only for now</span>
              </label>
            </div>

            {newMarkLossyOnly ? (
              <label className="mt-3 inline-flex items-start gap-2 rounded-lg border border-amber-700/60 bg-amber-950/40 px-3 py-2 text-amber-200">
                <input
                  type="checkbox"
                  checked={newConfirmLossyOnly}
                  onChange={(event) => setNewConfirmLossyOnly(event.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  I confirm this release currently has no lossless masters and should show a quality
                  disclosure.
                </span>
              </label>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex justify-end">
          <button
            type="submit"
            disabled={
              createPending ||
              coverUploadTarget === "new" ||
              activeArtists.length === 0 ||
              (newMarkLossyOnly && !newConfirmLossyOnly)
            }
            className={primaryButtonClassName}
          >
            {createPending ? "Creating..." : "Create Release"}
          </button>
        </div>

        {activeArtists.length === 0 ? (
          <p className="mt-3 text-xs text-amber-300">
            Create at least one active artist before creating releases.
          </p>
        ) : null}
      </form>
      ) : null}

      {notice ? <p className="mt-4 text-sm text-emerald-400">{notice}</p> : null}
      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

      {loading ? (
        <p className="mt-5 text-sm text-zinc-500">Loading releases...</p>
      ) : releases.length === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed border-slate-700 p-4 text-sm text-zinc-500">
          No releases yet. Use the + card above to create your first release.
        </p>
      ) : createComposerOpen ? (
        <p className="mt-5 rounded-xl border border-dashed border-slate-700 p-4 text-sm text-zinc-500">
          Creating a new release. Close the composer to return to release editing.
        </p>
      ) : selectedReleaseId === null ? (
        <p className="mt-5 rounded-xl border border-dashed border-slate-700 p-4 text-sm text-zinc-500">
          Select a release from the top strip.
        </p>
      ) : (
        <div className="mt-5 space-y-4">
          {releases.filter((release) => release.id === selectedReleaseId).map((release) => {
            const draft = draftsById[release.id] ?? toReleaseDraft(release);
            const isPending = pendingReleaseId === release.id;
            const importTrackPending = pendingTrackImportReleaseId === release.id;
            const previewApplyPending = pendingPreviewApplyReleaseId === release.id;
            const reorderTrackPending = pendingTrackReorderReleaseId === release.id;
            const importJobs = trackImportJobsByReleaseId[release.id] ?? [];
            const expandedTrackIdForRelease = expandedTrackIdByReleaseId[release.id] ?? null;
            const draggingTrackIdForRelease = draggingTrackIdByReleaseId[release.id] ?? null;
            const dragOverTrackIdForRelease = dragOverTrackIdByReleaseId[release.id] ?? null;
            const latestTrackUpdatedAt = release.tracks.reduce<string | null>(
              (latest, track) => {
                if (!latest) {
                  return track.updatedAt;
                }

                return new Date(track.updatedAt).getTime() > new Date(latest).getTime()
                  ? track.updatedAt
                  : latest;
              },
              null,
            );
            const estimate = getPricingEstimate(draft, release.currency || "USD");
            const existingCoverPreviewSrc =
              localCoverPreviewById[release.id] ?? draft.coverImageUrl;

            return (
              <article key={release.id} className="rounded-xl border border-slate-700 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-zinc-100">{release.title}</h3>
                    {release.deletedAt ? (
                      <span className="rounded-full border border-amber-700/70 bg-amber-950/50 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                        deleted
                      </span>
                    ) : null}
                    {release.qualityDisclosureRequired ? (
                      <span className="rounded-full border border-rose-700/70 bg-rose-950/40 px-2 py-0.5 text-[11px] font-medium text-rose-300">
                        quality disclosure
                      </span>
                    ) : null}
                  </div>

                  <p className="text-xs text-zinc-500">
                    {release._count.tracks} tracks • {release._count.files} files • {release._count.orderItems} orders
                  </p>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs text-zinc-500 sm:col-span-2">
                    Artist
                    <select
                      value={draft.artistId}
                      onChange={(event) =>
                        setDraftsById((previous) => ({
                          ...previous,
                          [release.id]: { ...draft, artistId: event.target.value },
                        }))
                      }
                      className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
                    >
                      {artists.map((artist) => (
                        <option
                          key={artist.id}
                          value={artist.id}
                          disabled={artist.deletedAt !== null && artist.id !== release.artistId}
                        >
                          {artist.name}
                          {artist.deletedAt ? " (deleted)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-xs text-zinc-500 sm:col-span-2">
                    Title
                    <input
                      required
                      maxLength={160}
                      value={draft.title}
                      onChange={(event) =>
                        setDraftsById((previous) => ({
                          ...previous,
                          [release.id]: { ...draft, title: event.target.value },
                        }))
                      }
                      className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
                    />
                  </label>

                  {advancedById[release.id] ? (
                    <label className="flex flex-col gap-1 text-xs text-zinc-500 sm:col-span-2">
                      URL
                      <input
                        maxLength={160}
                        value={draft.slug}
                        onChange={(event) =>
                          setDraftsById((previous) => ({
                            ...previous,
                            [release.id]: {
                              ...draft,
                              slug: sanitizeUrlInput(event.target.value),
                            },
                          }))
                        }
                        className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
                      />
                      <span className="text-[11px] text-zinc-500">
                        Preview: {getReleaseUrlPreview(draft.title, draft.slug)}
                      </span>
                    </label>
                  ) : null}

                  <label className="flex flex-col gap-1 text-xs text-zinc-500 sm:col-span-2">
                    Description
                    <textarea
                      rows={3}
                      maxLength={4_000}
                      value={draft.description}
                      onChange={(event) =>
                        setDraftsById((previous) => ({
                          ...previous,
                          [release.id]: { ...draft, description: event.target.value },
                        }))
                      }
                      className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
                    />
                  </label>

                  <div className="rounded-lg border border-slate-700/80 bg-slate-900/50 p-3 text-xs text-zinc-400 sm:col-span-2">
                    <p className="font-medium text-zinc-300">Cover artwork</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <label className={buttonClassName}>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
                          className="hidden"
                          onChange={(event) => void onExistingCoverFileChange(release.id, event)}
                          disabled={isPending || createPending || coverUploadTarget === release.id}
                        />
                        {coverUploadTarget === release.id ? "Uploading..." : "Upload Cover"}
                      </label>
                      <button
                        type="button"
                        className={buttonClassName}
                        disabled={
                          isPending ||
                          createPending ||
                          coverUploadTarget === release.id ||
                          existingCoverPreviewSrc.length === 0
                        }
                        onClick={() => {
                          setLocalCoverPreviewForRelease(release.id, null);
                          setDraftsById((previous) => ({
                            ...previous,
                            [release.id]: {
                              ...draft,
                              coverImageUrl: "",
                              coverStorageKey: null,
                              removeCoverImage: true,
                            },
                          }));
                        }}
                      >
                        Remove Cover
                      </button>
                    </div>

                    {existingCoverPreviewSrc ? (
                      <div className="mt-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={toCoverDisplaySrc(existingCoverPreviewSrc)}
                          alt={`${draft.title} cover preview`}
                          className="h-24 w-24 rounded-lg border border-slate-700 object-cover"
                        />
                      </div>
                    ) : (
                      <p className="mt-3 text-xs text-zinc-500">No cover artwork.</p>
                    )}
                  </div>

                  <label className="flex flex-col gap-1 text-xs text-zinc-500">
                    Pricing mode
                    <select
                      value={draft.pricingMode}
                      onChange={(event) => {
                        const value = event.target.value as PricingMode;
                        setDraftsById((previous) => ({
                          ...previous,
                          [release.id]: {
                            ...draft,
                            pricingMode: value,
                            allowFreeCheckout:
                              value === "PWYW" ? draft.allowFreeCheckout : false,
                          },
                        }));
                      }}
                      className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
                    >
                      {pricingModeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-xs text-zinc-500">
                    Status
                    <select
                      value={draft.status}
                      onChange={(event) =>
                        setDraftsById((previous) => ({
                          ...previous,
                          [release.id]: {
                            ...draft,
                            status: event.target.value as ReleaseStatus,
                          },
                        }))
                      }
                      className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
                    >
                      {statusOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-xs text-zinc-500">
                    Release date
                    <input
                      type="date"
                      required
                      value={draft.releaseDate}
                      onChange={(event) =>
                        setDraftsById((previous) => ({
                          ...previous,
                          [release.id]: {
                            ...draft,
                            releaseDate: event.target.value,
                          },
                        }))
                      }
                      className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
                    />
                  </label>

                  {draft.pricingMode === "FIXED" ? (
                    <label className="flex flex-col gap-1 text-xs text-zinc-500 sm:col-span-2">
                      Fixed price ({release.currency})
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        value={draft.fixedPrice}
                        onChange={(event) =>
                          setDraftsById((previous) => ({
                            ...previous,
                            [release.id]: {
                              ...draft,
                              fixedPrice: event.target.value,
                            },
                          }))
                        }
                        className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
                      />
                    </label>
                  ) : null}

                  {draft.pricingMode === "PWYW" ? (
                    <div className="flex flex-col gap-2 text-xs text-zinc-500 sm:col-span-2">
                      <label className="flex flex-col gap-1">
                        PWYW minimum ({release.currency})
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          value={draft.minimumPrice}
                          onChange={(event) =>
                            setDraftsById((previous) => ({
                              ...previous,
                              [release.id]: {
                                ...draft,
                                minimumPrice: event.target.value,
                              },
                            }))
                          }
                          className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
                          placeholder={draft.allowFreeCheckout ? "0.00" : "2.00"}
                        />
                      </label>
                      <label className="inline-flex items-center gap-2 text-zinc-300">
                        <input
                          type="checkbox"
                          checked={draft.allowFreeCheckout}
                          onChange={(event) =>
                            setDraftsById((previous) => ({
                              ...previous,
                              [release.id]: {
                                ...draft,
                                allowFreeCheckout: event.target.checked,
                                minimumPrice:
                                  event.target.checked && draft.minimumPrice.trim().length === 0
                                    ? "0.00"
                                    : draft.minimumPrice,
                              },
                            }))
                          }
                        />
                        Allow free checkout ($0)
                      </label>
                    </div>
                  ) : null}

                  <div className="rounded-lg border border-slate-700/80 bg-slate-900/50 p-3 text-xs text-zinc-400 sm:col-span-2">
                    <p className="font-medium text-zinc-300">Pricing estimate</p>
                    {renderPricingDetails(draft, release.currency || "USD")}
                  </div>

                  <div className="rounded-lg border border-slate-700/80 bg-slate-900/50 p-3 text-xs text-zinc-400 sm:col-span-2">
                    <p className="font-medium text-zinc-300">Master quality workflow</p>
                    <p className="mt-1">
                      Release assets tracked: {release.trackAssetCount}. Lossless masters detected: {release.hasLosslessMasters ? "yes" : "no"}.
                    </p>

                    <div className="mt-3 flex flex-col gap-2">
                      <label className="inline-flex items-start gap-2">
                        <input
                          type="radio"
                          name={`lossless-${release.id}`}
                          checked={!draft.markLossyOnly}
                          onChange={() =>
                            setDraftsById((previous) => ({
                              ...previous,
                              [release.id]: {
                                ...draft,
                                markLossyOnly: false,
                                confirmLossyOnly: false,
                              },
                            }))
                          }
                          className="mt-0.5"
                        />
                        <span className="text-zinc-300">Lossless masters available</span>
                      </label>
                      <label className="inline-flex items-start gap-2">
                        <input
                          type="radio"
                          name={`lossless-${release.id}`}
                          checked={draft.markLossyOnly}
                          onChange={() =>
                            setDraftsById((previous) => ({
                              ...previous,
                              [release.id]: {
                                ...draft,
                                markLossyOnly: true,
                                confirmLossyOnly: release.isLossyOnly
                                  ? draft.confirmLossyOnly
                                  : false,
                              },
                            }))
                          }
                          className="mt-0.5"
                        />
                        <span className="text-zinc-300">Lossy-only for now</span>
                      </label>
                    </div>

                    {draft.markLossyOnly ? (
                      <label className="mt-3 inline-flex items-start gap-2 rounded-lg border border-amber-700/60 bg-amber-950/40 px-3 py-2 text-amber-200">
                        <input
                          type="checkbox"
                          checked={draft.confirmLossyOnly}
                          onChange={(event) =>
                            setDraftsById((previous) => ({
                              ...previous,
                              [release.id]: {
                                ...draft,
                                confirmLossyOnly: event.target.checked,
                              },
                            }))
                          }
                          className="mt-0.5"
                        />
                        <span>
                          I confirm this release should be marked lossy-only and show quality
                          disclosure.
                        </span>
                      </label>
                    ) : null}
                  </div>

                  <div className="rounded-lg border border-slate-700/80 bg-slate-900/50 p-3 text-xs text-zinc-400 sm:col-span-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-zinc-300">Track Management</p>
                      <p className="text-[11px] text-zinc-500">
                        {release.tracks.length} track{release.tracks.length === 1 ? "" : "s"}
                      </p>
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-6">
                      {(() => {
                        const newTrackDraft =
                          newTrackByReleaseId[release.id] ?? toNewTrackDraft(release);
                        const previewDraft =
                          previewByReleaseId[release.id] ?? toReleasePreviewDraft(release);
                        const createTrackPending = pendingTrackCreateReleaseId === release.id;

                        return (
                          <>
                            <div className="mb-2 grid gap-2 rounded-md border border-slate-700/70 bg-slate-950/60 p-2 sm:col-span-6 sm:grid-cols-6">
                              <label className="flex flex-col gap-1 text-[11px] text-zinc-500 sm:col-span-2">
                                Release preview mode
                                <select
                                  value={previewDraft.previewMode}
                                  onChange={(event) => {
                                    const nextDraft = {
                                      ...previewDraft,
                                      previewMode: event.target.value as PreviewMode,
                                    };
                                    setPreviewByReleaseId((previous) => ({
                                      ...previous,
                                      [release.id]: {
                                        ...nextDraft,
                                      },
                                    }));
                                    if (release.tracks.length > 0) {
                                      void onApplyReleasePreviewToTracks(release, nextDraft, {
                                        silent: true,
                                      });
                                    }
                                  }}
                                  className="rounded-md border border-slate-600 bg-slate-950 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-slate-400"
                                  disabled={
                                    isPending ||
                                    createTrackPending ||
                                    importTrackPending ||
                                    previewApplyPending ||
                                    reorderTrackPending
                                  }
                                >
                                  {previewModeOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="flex flex-col gap-1 text-[11px] text-zinc-500 sm:col-span-2">
                                Release preview seconds
                                <input
                                  value={previewDraft.previewSeconds}
                                  onChange={(event) =>
                                    setPreviewByReleaseId((previous) => ({
                                      ...previous,
                                      [release.id]: {
                                        ...previewDraft,
                                        previewSeconds: event.target.value,
                                      },
                                    }))
                                  }
                                  onBlur={(event) => {
                                    if (release.tracks.length === 0) {
                                      return;
                                    }

                                    const nextDraft = {
                                      ...previewDraft,
                                      previewSeconds: event.target.value,
                                    };
                                    void onApplyReleasePreviewToTracks(release, nextDraft, {
                                      silent: true,
                                    });
                                  }}
                                  className="rounded-md border border-slate-600 bg-slate-950 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-slate-400 disabled:opacity-50"
                                  inputMode="numeric"
                                  placeholder="30"
                                  disabled={
                                    isPending ||
                                    createTrackPending ||
                                    importTrackPending ||
                                    previewApplyPending ||
                                    reorderTrackPending ||
                                    previewDraft.previewMode === "FULL"
                                  }
                                />
                              </label>
                              <div className="sm:col-span-2" />
                              <p className="text-[11px] text-zinc-500 sm:col-span-6">
                                New and existing tracks use this release preview setting
                                automatically.
                              </p>
                            </div>
                            <div className="mb-2 flex flex-wrap items-center gap-2 sm:col-span-6">
                              <label className={buttonClassName}>
                                <input
                                  type="file"
                                  accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/wave,audio/flac,audio/x-flac,audio/aac,audio/mp4,audio/x-m4a,audio/ogg,audio/webm,audio/aiff,audio/x-aiff"
                                  className="hidden"
                                  multiple
                                  onChange={(event) => void onImportTrackFiles(release, event)}
                                  disabled={
                                    isPending ||
                                    createTrackPending ||
                                    importTrackPending ||
                                    previewApplyPending ||
                                    reorderTrackPending ||
                                    pendingTrackUploadId !== null ||
                                    pendingTrackId !== null
                                  }
                                />
                                {importTrackPending ? "Importing tracks..." : "Import Tracks"}
                              </label>
                              <p className="text-[11px] text-zinc-500">
                                Batch create tracks from files and upload masters in one step.
                              </p>
                            </div>
                            {importJobs.length > 0 ? (
                              <div className="mb-2 space-y-1 rounded-md border border-slate-700/70 bg-slate-950/60 p-2 text-[11px] text-zinc-400 sm:col-span-6">
                                {importJobs.map((job) => (
                                  <p key={job.id}>
                                    #{job.plannedTrackNumber} {job.title} ({formatTrackDuration(job.durationMs)}){" "}
                                    - {job.status}
                                    {job.error ? `: ${job.error}` : ""}
                                  </p>
                                ))}
                              </div>
                            ) : null}
                            <label className="flex flex-col gap-1 text-[11px] text-zinc-500 sm:col-span-2">
                              New track title
                              <input
                                value={newTrackDraft.title}
                                onChange={(event) =>
                                  setNewTrackByReleaseId((previous) => ({
                                    ...previous,
                                    [release.id]: {
                                      ...newTrackDraft,
                                      title: event.target.value,
                                    },
                                  }))
                                }
                                className="rounded-md border border-slate-600 bg-slate-950 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-slate-400"
                                placeholder="Track title"
                                disabled={
                                  isPending ||
                                  createTrackPending ||
                                  importTrackPending ||
                                  previewApplyPending ||
                                  reorderTrackPending
                                }
                              />
                            </label>
                            <label className="flex flex-col gap-1 text-[11px] text-zinc-500">
                              Track Number
                              <input
                                value={newTrackDraft.trackNumber}
                                onChange={(event) =>
                                  setNewTrackByReleaseId((previous) => ({
                                    ...previous,
                                    [release.id]: {
                                      ...newTrackDraft,
                                      trackNumber: event.target.value,
                                    },
                                  }))
                                }
                                className="rounded-md border border-slate-600 bg-slate-950 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-slate-400"
                                inputMode="numeric"
                                placeholder={String(release.tracks.length + 1)}
                                disabled={
                                  isPending ||
                                  createTrackPending ||
                                  importTrackPending ||
                                  previewApplyPending ||
                                  reorderTrackPending
                                }
                              />
                            </label>
                            <label className="flex flex-col gap-1 text-[11px] text-zinc-500 sm:col-span-6">
                              Credits
                              <textarea
                                rows={2}
                                value={newTrackDraft.credits}
                                onChange={(event) =>
                                  setNewTrackByReleaseId((previous) => ({
                                    ...previous,
                                    [release.id]: {
                                      ...newTrackDraft,
                                      credits: event.target.value,
                                    },
                                  }))
                                }
                                className="rounded-md border border-slate-600 bg-slate-950 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-slate-400"
                                placeholder="Optional credits"
                                disabled={
                                  isPending ||
                                  createTrackPending ||
                                  importTrackPending ||
                                  previewApplyPending ||
                                  reorderTrackPending
                                }
                              />
                            </label>
                            <label className="flex flex-col gap-1 text-[11px] text-zinc-500 sm:col-span-6">
                              Lyrics
                              <textarea
                                rows={2}
                                value={newTrackDraft.lyrics}
                                onChange={(event) =>
                                  setNewTrackByReleaseId((previous) => ({
                                    ...previous,
                                    [release.id]: {
                                      ...newTrackDraft,
                                      lyrics: event.target.value,
                                    },
                                  }))
                                }
                                className="rounded-md border border-slate-600 bg-slate-950 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-slate-400"
                                placeholder="Optional lyrics"
                                disabled={
                                  isPending ||
                                  createTrackPending ||
                                  importTrackPending ||
                                  previewApplyPending ||
                                  reorderTrackPending
                                }
                              />
                            </label>
                            <div className="sm:col-span-6">
                              <button
                                type="button"
                                onClick={() => void onCreateTrack(release)}
                                disabled={
                                  isPending ||
                                  createTrackPending ||
                                  importTrackPending ||
                                  previewApplyPending ||
                                  reorderTrackPending
                                }
                                className={buttonClassName}
                              >
                                {createTrackPending
                                  ? "Adding track..."
                                  : reorderTrackPending
                                    ? "Reordering..."
                                    : "Add Track"}
                              </button>
                            </div>
                          </>
                        );
                      })()}
                    </div>

                    {release.tracks.length === 0 ? (
                      <p className="mt-3 rounded-lg border border-dashed border-slate-700/80 p-3 text-xs text-zinc-500">
                        No tracks yet. Import files or add a track manually, then upload master and
                        delivery assets.
                      </p>
                    ) : (
                      <div className="mt-3 space-y-3">
                        {sortTracks(release.tracks).map((track) => {
                          const trackDraft = trackDraftsById[track.id] ?? toTrackDraft(track);
                          const isTrackExpanded = expandedTrackIdForRelease === track.id;
                          const trackPending = pendingTrackId === track.id;
                          const trackUploadPending = pendingTrackUploadId === track.id;
                          const isTrackDragging = draggingTrackIdForRelease === track.id;
                          const isTrackDragOver = dragOverTrackIdForRelease === track.id;
                          const trackUploadProgress = trackUploadProgressById[track.id] ?? 0;
                          const trackUploadRole = trackUploadRoleById[track.id] ?? "MASTER";
                          const previewStatus = getTrackPreviewStatus(track);
                          const masterCount = track.assets.filter(
                            (asset) => asset.assetRole === "MASTER",
                          ).length;
                          const deliveryCount = track.assets.filter(
                            (asset) => asset.assetRole === "DELIVERY",
                          ).length;
                          const previewCount = track.assets.filter(
                            (asset) => asset.assetRole === "PREVIEW",
                          ).length;
                          const lastFailedJob = track.transcodeJobs
                            .filter((job) => job.status === "FAILED")
                            .sort(
                              (a, b) =>
                                new Date(b.updatedAt).getTime() -
                                new Date(a.updatedAt).getTime(),
                            )[0];

                          return (
                            <div
                              key={track.id}
                              className={`rounded-lg border bg-slate-950/60 p-3 ${
                                isTrackDragOver
                                  ? "border-emerald-500/70"
                                  : "border-slate-700"
                              }`}
                              onDragOver={(event) => {
                                if (!draggingTrackIdForRelease || reorderTrackPending) {
                                  return;
                                }
                                event.preventDefault();
                                event.dataTransfer.dropEffect = "move";
                                setDragOverTrackIdByReleaseId((previous) => ({
                                  ...previous,
                                  [release.id]: track.id,
                                }));
                              }}
                              onDrop={(event) => {
                                event.preventDefault();
                                void onReorderTrackDrop(release, track.id);
                              }}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span
                                    draggable={!reorderTrackPending}
                                    onDragStart={(event) => {
                                      if (reorderTrackPending) {
                                        return;
                                      }
                                      event.dataTransfer.effectAllowed = "move";
                                      event.dataTransfer.setData("text/plain", track.id);
                                      setDraggingTrackIdByReleaseId((previous) => ({
                                        ...previous,
                                        [release.id]: track.id,
                                      }));
                                    }}
                                    onDragEnd={() => {
                                      setDraggingTrackIdByReleaseId((previous) => ({
                                        ...previous,
                                        [release.id]: null,
                                      }));
                                      setDragOverTrackIdByReleaseId((previous) => ({
                                        ...previous,
                                        [release.id]: null,
                                      }));
                                    }}
                                    className={`select-none rounded border px-1 py-0 text-[11px] ${
                                      isTrackDragging
                                        ? "border-emerald-500/70 text-emerald-300"
                                        : "border-slate-600 text-zinc-400"
                                    } ${reorderTrackPending ? "cursor-not-allowed" : "cursor-grab"}`}
                                    aria-label={`Drag to reorder ${track.title}`}
                                    title="Drag to reorder"
                                  >
                                    ||
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedTrackIdByReleaseId((previous) => ({
                                        ...previous,
                                        [release.id]: isTrackExpanded ? null : track.id,
                                      }))
                                    }
                                    className="text-left text-xs font-medium text-zinc-200 hover:text-zinc-100"
                                  >
                                    Track {track.trackNumber} • {track.title} •{" "}
                                    {formatTrackDuration(track.durationMs)} •{" "}
                                    {isTrackExpanded ? "Hide details" : "Edit details"}
                                  </button>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={previewStatus.className}>
                                    {previewStatus.label}
                                  </span>
                                  <span className="text-[11px] text-zinc-500">
                                    assets: {masterCount} master, {deliveryCount} delivery,{" "}
                                    {previewCount} preview
                                  </span>
                                </div>
                              </div>

                              {isTrackExpanded ? (
                                <>
                                  <div className="mt-3 grid gap-3 sm:grid-cols-6">
                                <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400 sm:col-span-4">
                                  Title
                                  <input
                                    value={trackDraft.title}
                                    onChange={(event) =>
                                      setTrackDraftsById((previous) => ({
                                        ...previous,
                                        [track.id]: {
                                          ...trackDraft,
                                          title: event.target.value,
                                        },
                                      }))
                                    }
                                    className="rounded-lg border border-slate-500/80 bg-slate-900/80 px-2.5 py-2 text-sm text-zinc-100 shadow-inner outline-none transition focus:border-emerald-400/80 focus:ring-2 focus:ring-emerald-500/20"
                                    disabled={
                                      isPending ||
                                      trackPending ||
                                      importTrackPending ||
                                      previewApplyPending ||
                                      reorderTrackPending
                                    }
                                  />
                                </label>
                                <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400 sm:col-span-2">
                                  Track Number
                                  <input
                                    value={trackDraft.trackNumber}
                                    onChange={(event) =>
                                      setTrackDraftsById((previous) => ({
                                        ...previous,
                                        [track.id]: {
                                          ...trackDraft,
                                          trackNumber: event.target.value,
                                        },
                                      }))
                                    }
                                    className="rounded-lg border border-slate-500/80 bg-slate-900/80 px-2.5 py-2 text-sm text-zinc-100 shadow-inner outline-none transition focus:border-emerald-400/80 focus:ring-2 focus:ring-emerald-500/20"
                                    inputMode="numeric"
                                    disabled={
                                      isPending ||
                                      trackPending ||
                                      importTrackPending ||
                                      previewApplyPending ||
                                      reorderTrackPending
                                    }
                                  />
                                </label>
                                <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400 sm:col-span-3">
                                  Credits
                                  <textarea
                                    rows={3}
                                    value={trackDraft.credits}
                                    onChange={(event) =>
                                      setTrackDraftsById((previous) => ({
                                        ...previous,
                                        [track.id]: {
                                          ...trackDraft,
                                          credits: event.target.value,
                                        },
                                      }))
                                    }
                                    className="min-h-[88px] rounded-lg border border-slate-500/80 bg-slate-900/80 px-2.5 py-2 text-sm text-zinc-100 shadow-inner outline-none transition focus:border-emerald-400/80 focus:ring-2 focus:ring-emerald-500/20"
                                    disabled={
                                      isPending ||
                                      trackPending ||
                                      importTrackPending ||
                                      previewApplyPending ||
                                      reorderTrackPending
                                    }
                                  />
                                </label>
                                <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400 sm:col-span-3">
                                  Lyrics
                                  <textarea
                                    rows={3}
                                    value={trackDraft.lyrics}
                                    onChange={(event) =>
                                      setTrackDraftsById((previous) => ({
                                        ...previous,
                                        [track.id]: {
                                          ...trackDraft,
                                          lyrics: event.target.value,
                                        },
                                      }))
                                    }
                                    className="min-h-[88px] rounded-lg border border-slate-500/80 bg-slate-900/80 px-2.5 py-2 text-sm text-zinc-100 shadow-inner outline-none transition focus:border-emerald-400/80 focus:ring-2 focus:ring-emerald-500/20"
                                    disabled={
                                      isPending ||
                                      trackPending ||
                                      importTrackPending ||
                                      previewApplyPending ||
                                      reorderTrackPending
                                    }
                                  />
                                </label>
                                  </div>

                                  <div className="mt-3 flex flex-wrap items-center gap-2">
                                <select
                                  value={trackUploadRole}
                                  onChange={(event) =>
                                    setTrackUploadRoleById((previous) => ({
                                      ...previous,
                                      [track.id]: event.target.value as "MASTER" | "DELIVERY",
                                    }))
                                  }
                                  disabled={
                                    isPending ||
                                    trackPending ||
                                    importTrackPending ||
                                    previewApplyPending ||
                                    reorderTrackPending ||
                                    trackUploadPending
                                  }
                                  className="rounded-md border border-slate-600 bg-slate-950 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-slate-400 disabled:opacity-50"
                                  aria-label={`Asset role for ${track.title}`}
                                >
                                  <option value="MASTER">Master</option>
                                  <option value="DELIVERY">Delivery</option>
                                </select>
                                <label className={buttonClassName}>
                                  <input
                                    type="file"
                                    accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/wave,audio/flac,audio/x-flac,audio/aac,audio/mp4,audio/x-m4a,audio/ogg,audio/webm,audio/aiff,audio/x-aiff"
                                    className="hidden"
                                    onChange={(event) =>
                                      void onInlineTrackFileChange(release.id, track, event)
                                    }
                                    disabled={
                                      isPending ||
                                      trackPending ||
                                      importTrackPending ||
                                      previewApplyPending ||
                                      reorderTrackPending ||
                                      trackUploadPending
                                    }
                                  />
                                  {trackUploadPending
                                    ? `Uploading ${trackUploadProgress}%`
                                    : `Upload ${trackUploadRole === "MASTER" ? "Master" : "Delivery"}`}
                                </label>
                                <button
                                  type="button"
                                  onClick={() => void onUpdateTrack(release.id, track.id)}
                                  disabled={
                                    isPending ||
                                    trackPending ||
                                    importTrackPending ||
                                    previewApplyPending ||
                                    reorderTrackPending ||
                                    trackUploadPending
                                  }
                                  className={buttonClassName}
                                >
                                  {trackPending ? "Saving..." : "Save Track"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (
                                      track.assets.length > 0 &&
                                      !window.confirm(
                                        "Deleting this track also removes its linked assets and preview jobs. Continue?",
                                      )
                                    ) {
                                      return;
                                    }
                                    void onDeleteTrack(release.id, track);
                                  }}
                                  disabled={
                                    isPending ||
                                    trackPending ||
                                    importTrackPending ||
                                    previewApplyPending ||
                                    reorderTrackPending ||
                                    trackUploadPending
                                  }
                                  className={dangerButtonClassName}
                                >
                                  {trackPending ? "Deleting..." : "Delete Track"}
                                </button>
                                  </div>

                                  {lastFailedJob?.errorMessage ? (
                                    <p className="mt-2 rounded-md border border-rose-700/60 bg-rose-950/40 px-2 py-1 text-[11px] text-rose-200">
                                      Last preview error: {lastFailedJob.errorMessage}
                                    </p>
                                  ) : null}
                                </>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <p className="mt-3 text-xs text-zinc-500">
                  Updated {formatIsoTimestampForDisplay(release.updatedAt)}
                  {release.releaseDate
                    ? ` • Release date ${formatIsoTimestampForDisplay(release.releaseDate)}`
                    : ""}
                  {release.deletedAt
                    ? ` • Deleted ${formatIsoTimestampForDisplay(release.deletedAt)}`
                    : ""}
                  {release.publishedAt
                    ? ` • Published ${formatIsoTimestampForDisplay(release.publishedAt)}`
                    : ""}
                </p>
                {latestTrackUpdatedAt ? (
                  <p className="mt-1 text-xs text-zinc-500">
                    Last track update {formatIsoTimestampForDisplay(latestTrackUpdatedAt)}
                  </p>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={isPending || createPending}
                    onClick={() =>
                      setAdvancedById((previous) => ({
                        ...previous,
                        [release.id]: !previous[release.id],
                      }))
                    }
                    className={buttonClassName}
                  >
                    {advancedById[release.id] ? "Hide Advanced" : "Advanced"}
                  </button>

                  <button
                    type="button"
                    disabled={
                      isPending ||
                      createPending ||
                      coverUploadTarget === release.id ||
                      (draft.markLossyOnly && !draft.confirmLossyOnly)
                    }
                    onClick={() => void onUpdateRelease(release.id)}
                    className={buttonClassName}
                  >
                    {isPending ? "Saving..." : "Save"}
                  </button>

                  <button
                    type="button"
                    disabled={isPending || createPending}
                    onClick={() => void onSoftDeleteOrRestoreRelease(release)}
                    className={buttonClassName}
                  >
                    {isPending
                      ? release.deletedAt
                        ? "Restoring..."
                        : "Deleting..."
                      : release.deletedAt
                        ? "Restore"
                        : "Soft Delete"}
                  </button>

                  {release.deletedAt ? (
                    <button
                      type="button"
                      disabled={isPending || createPending}
                      onClick={() => {
                        setPurgeDialogRelease(release);
                        setPurgeConfirmInput("");
                      }}
                      className={dangerButtonClassName}
                    >
                      {isPending ? "Purging..." : "Permanent Purge"}
                    </button>
                  ) : null}
                </div>

                {estimate && draft.pricingMode !== "FREE" ? (
                  <p className="mt-2 text-xs text-zinc-500">
                    Preview: {estimate.grossLabel} gross • ~{estimate.feeLabel} fee • ~
                    {estimate.netLabel} payout
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      {purgeDialogRelease ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm release asset purge"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <h3 className="text-lg font-semibold text-zinc-100">Confirm destructive action</h3>
            <p className="mt-2 text-sm text-zinc-400">
              This permanently removes stored assets for <span className="font-semibold">{purgeDialogRelease.title}</span>. The release record remains for history and can no longer serve those files.
            </p>
            <p className="mt-2 text-sm text-zinc-500">
              Fully delete permanently removes both stored assets and the release record. Releases
              with existing orders cannot be fully deleted.
            </p>

            <label className="mt-4 flex flex-col gap-1 text-xs text-zinc-500">
              Release title confirmation
              <input
                value={purgeConfirmInput}
                onChange={(event) => setPurgeConfirmInput(event.target.value)}
                className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-slate-400"
                placeholder={purgeDialogRelease.title}
              />
            </label>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className={buttonClassName}
                onClick={() => {
                  if (pendingReleaseId) {
                    return;
                  }
                  setPurgeDialogRelease(null);
                  setPurgeConfirmInput("");
                }}
                disabled={Boolean(pendingReleaseId)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={dangerButtonClassName}
                disabled={
                  Boolean(pendingReleaseId) ||
                  purgeConfirmInput.trim() !== purgeDialogRelease.title
                }
                onClick={() => void onPurgeRelease(purgeDialogRelease, purgeConfirmInput)}
              >
                {pendingReleaseId ? "Purging..." : "Confirm Purge"}
              </button>
              <button
                type="button"
                className={dangerButtonClassName}
                disabled={
                  Boolean(pendingReleaseId) ||
                  purgeConfirmInput.trim() !== purgeDialogRelease.title
                }
                onClick={() => void onHardDeleteRelease(purgeDialogRelease, purgeConfirmInput)}
              >
                {pendingReleaseId ? "Deleting..." : "Fully Delete Record"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
