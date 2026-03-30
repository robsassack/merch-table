import type { ParsedTrackImportFileMetadata } from "@/lib/audio/track-import-browser";

export type PricingMode = "FREE" | "FIXED" | "PWYW";
export type ReleaseStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type PreviewMode = "CLIP" | "FULL";
export type AssetRole = "MASTER" | "PREVIEW" | "DELIVERY";
export type TranscodeStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";

export type ArtistOption = {
  id: string;
  name: string;
  deletedAt: string | null;
};

export type ReleaseRecord = {
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
  minimumPriceFloorCents?: number;
  storeCurrency?: string;
  stripeFeeEstimate?: {
    percentBps: number;
    fixedFeeCents: number;
  };
  artists?: ArtistOption[];
  releases?: ReleaseRecord[];
};

export type ReleaseMutationResponse = {
  ok?: boolean;
  error?: string;
  release?: ReleaseRecord;
  hardDeletedReleaseId?: string;
  purgedAssetCount?: number;
};

export type TrackMutationResponse = {
  ok?: boolean;
  error?: string;
  track?: TrackRecord;
  deletedTrackId?: string;
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

export type TrackDraft = {
  title: string;
  trackNumber: string;
  lyrics: string;
  credits: string;
};

export type NewTrackDraft = {
  title: string;
  trackNumber: string;
  lyrics: string;
  credits: string;
};

export type ReleasePreviewDraft = {
  previewMode: PreviewMode;
  previewSeconds: string;
};

export type TrackImportMode = "append" | "replace";
export type TrackImportStatus = "pending" | "track-created" | "uploaded" | "failed";

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
