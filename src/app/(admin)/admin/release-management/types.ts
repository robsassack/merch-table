import type { ParsedTrackImportFileMetadata } from "@/lib/audio/track-import-browser";

export type PricingMode = "FREE" | "FIXED" | "PWYW";
export type ReleaseStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type ReleaseType =
  | "ALBUM"
  | "EP"
  | "SINGLE"
  | "COMPILATION"
  | "MIXTAPE"
  | "LIVE_ALBUM"
  | "SOUNDTRACK_SCORE"
  | "DEMO"
  | "BOOTLEG"
  | "REMIX"
  | "OTHER";
export type PreviewMode = "CLIP" | "FULL" | "NONE";
export type AssetRole = "MASTER" | "PREVIEW" | "DELIVERY";
export type TranscodeStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
export type TranscodeJobKind = "PREVIEW_CLIP" | "DELIVERY_FORMATS";
export type DeliveryFormat = "MP3" | "M4A" | "FLAC";

export type ArtistOption = {
  id: string;
  name: string;
  deletedAt: string | null;
};

export type ReleaseRecord = {
  id: string;
  artistId: string;
  featuredTrackId: string | null;
  title: string;
  releaseType: ReleaseType;
  label: string;
  slug: string;
  description: string | null;
  coverImageUrl: string | null;
  pricingMode: PricingMode;
  fixedPriceCents: number | null;
  minimumPriceCents: number | null;
  deliveryFormats: DeliveryFormat[];
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

export type TrackAssetRecord = {
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

export type TrackTranscodeJobRecord = {
  id: string;
  sourceAssetId: string;
  jobKind: TranscodeJobKind;
  status: TranscodeStatus;
  errorMessage: string | null;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TrackRecord = {
  id: string;
  title: string;
  artistOverride: string | null;
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

export type ReleasesListResponse = {
  ok?: boolean;
  error?: string;
  orgName?: string;
  minimumPriceFloorCents?: number;
  storeCurrency?: string;
  featuredReleaseId?: string | null;
  releaseDefaults?: {
    artistId: string | null;
    pricingMode: PricingMode | null;
    status: ReleaseStatus | null;
    type: ReleaseType | null;
    pwywMinimumCents: number | null;
    allowFreeCheckout: boolean | null;
    previewMode: PreviewMode;
    previewSeconds: number;
  };
  stripeFeeEstimate?: {
    percentBps: number;
    fixedFeeCents: number;
  };
  artists?: ArtistOption[];
  releases?: ReleaseRecord[];
};

export type TranscodeTasksStatus = {
  queueDepth: number | null;
  queuedJobs: number;
  runningJobs: number;
  workerUp: boolean | null;
  lastWorkerHeartbeatAt: string | null;
  workerStaleAfterSeconds: number;
  lastSuccessfulJobAt: string | null;
  checkedAt: string;
  warnings: string[];
};

export type TranscodeTasksStatusResponse = {
  ok?: boolean;
  error?: string;
  status?: TranscodeTasksStatus;
};

export type RecoverStuckTranscodesResponse = {
  ok?: boolean;
  error?: string;
  summary?: {
    staleQueued: {
      scanned: number;
      requeued: number;
      failed: number;
      skipped: number;
    };
    staleRunning: {
      scanned: number;
      requeued: number;
      failed: number;
      skipped: number;
    };
    retryDue: {
      scanned: number;
      enqueued: number;
      failed: number;
      skipped: number;
    };
    thresholds: {
      staleQueuedThresholdSeconds: number;
      staleRunningThresholdSeconds: number;
    };
    batchSizes: {
      staleRecoveryBatchSize: number;
      retryEnqueueBatchSize: number;
    };
  };
};

export type ReleaseMutationResponse = {
  ok?: boolean;
  error?: string;
  release?: ReleaseRecord;
  hardDeletedReleaseId?: string;
  purgedAssetCount?: number;
  failedJobsFound?: number;
  skippedFailedJobs?: number;
  queuedTranscodeJobs?: number;
  queuedPreviewJobs?: number;
  queuedDeliveryJobs?: number;
  alreadyQueuedJobs?: number;
  canceledTranscodeJobs?: number;
  canceledQueuedJobs?: number;
  canceledRunningJobs?: number;
};

export type TrackMutationResponse = {
  ok?: boolean;
  error?: string;
  track?: TrackRecord;
  deletedTrackId?: string;
  failedJobsFound?: number;
  skippedFailedJobs?: number;
  queuedTranscodeJobs?: number;
  queuedPreviewJobs?: number;
  queuedDeliveryJobs?: number;
  previewJobQueued?: boolean;
  previewJobId?: string | null;
};

export type UploadUrlResponse = {
  ok?: boolean;
  error?: string;
  storageProvider?: "GARAGE" | "S3";
  bucket?: string;
  storageKey?: string;
  uploadUrl?: string;
  expiresInSeconds?: number;
  requiredHeaders?: Record<string, string>;
};

export type TrackAssetCommitResponse = {
  ok?: boolean;
  error?: string;
  previewJobQueued?: boolean;
  deliveryJobQueued?: boolean;
  forcedLossyOnly?: boolean;
  forcedLosslessOnly?: boolean;
  removedDeliveryAssetCount?: number;
};

export type CoverUploadUrlResponse = {
  ok?: boolean;
  error?: string;
  storageKey?: string;
  publicUrl?: string;
  uploadUrl?: string;
  requiredHeaders?: Record<string, string>;
};

export type ReleaseDraft = {
  artistId: string;
  featuredTrackId: string | null;
  title: string;
  releaseType: ReleaseType;
  label: string;
  slug: string;
  description: string;
  coverImageUrl: string;
  coverStorageKey: string | null;
  removeCoverImage: boolean;
  pricingMode: PricingMode;
  fixedPrice: string;
  minimumPrice: string;
  deliveryFormats: DeliveryFormat[];
  allowFreeCheckout: boolean;
  status: ReleaseStatus;
  releaseDate: string;
  markLossyOnly: boolean;
  confirmLossyOnly: boolean;
};

export type TrackDraft = {
  title: string;
  artistOverride: string;
  trackNumber: string;
  lyrics: string;
  credits: string;
};

export type NewTrackDraft = {
  title: string;
  artistOverride: string;
  trackNumber: string;
  lyrics: string;
  credits: string;
};

export type ReleasePreviewDraft = {
  previewMode: PreviewMode;
  previewSeconds: string;
};

export type TrackImportMode = "append" | "insert";
export type TrackImportStatus = "pending" | "track-created" | "uploaded" | "failed";

export type ImportConflictDialogState = {
  releaseId: string;
  releaseTitle: string;
  existingTrackCount: number;
  selectedFiles: File[];
};

export type TrackDeleteDialogState = {
  releaseId: string;
  releaseTitle: string;
  track: TrackRecord;
};

export type TrackImportJob = {
  id: string;
  fileName: string;
  title: string;
  plannedTrackNumber: number;
  durationMs: number | null;
  status: TrackImportStatus;
  error: string | null;
};

export type PlannedTrackImport = {
  id: string;
  file: File;
  fileName: string;
  contentType: string;
  metadata: ParsedTrackImportFileMetadata;
  trackNumber: number;
};

export type TrackRecordPatch = {
  id: string;
  title: string;
  artistOverride: string | null;
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
