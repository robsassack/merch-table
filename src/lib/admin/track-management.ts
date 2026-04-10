import type { Prisma } from "@/generated/prisma/client";

import type { PreviewMode } from "@/generated/prisma/enums";

import type { AdminReleaseTrackRecord } from "@/lib/admin/release-management";

export const MIN_TRACK_PREVIEW_SECONDS = 5;
export const MAX_TRACK_PREVIEW_SECONDS = 300;

export const adminTrackSelect = {
  id: true,
  title: true,
  artistOverride: true,
  trackNumber: true,
  durationMs: true,
  lyrics: true,
  credits: true,
  previewMode: true,
  previewSeconds: true,
  createdAt: true,
  updatedAt: true,
  assets: {
    select: {
      id: true,
      storageKey: true,
      format: true,
      mimeType: true,
      fileSizeBytes: true,
      bitrateKbps: true,
      sampleRateHz: true,
      channels: true,
      isLossless: true,
      assetRole: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  transcodeJobs: {
    select: {
      id: true,
      sourceAssetId: true,
      jobKind: true,
      status: true,
      errorMessage: true,
      queuedAt: true,
      startedAt: true,
      finishedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  },
} satisfies Prisma.ReleaseTrackSelect;

export type AdminTrackRow = Prisma.ReleaseTrackGetPayload<{
  select: typeof adminTrackSelect;
}>;

export function toAdminTrackRecord(track: AdminTrackRow): AdminReleaseTrackRecord {
  return {
    id: track.id,
    title: track.title,
    artistOverride: track.artistOverride,
    trackNumber: track.trackNumber,
    durationMs: track.durationMs,
    lyrics: track.lyrics,
    credits: track.credits,
    previewMode: track.previewMode,
    previewSeconds: track.previewSeconds,
    createdAt: track.createdAt.toISOString(),
    updatedAt: track.updatedAt.toISOString(),
    assets: track.assets.map((asset) => ({
      id: asset.id,
      storageKey: asset.storageKey,
      format: asset.format,
      mimeType: asset.mimeType,
      fileSizeBytes: asset.fileSizeBytes,
      bitrateKbps: asset.bitrateKbps,
      sampleRateHz: asset.sampleRateHz,
      channels: asset.channels,
      isLossless: asset.isLossless,
      assetRole: asset.assetRole,
      createdAt: asset.createdAt.toISOString(),
      updatedAt: asset.updatedAt.toISOString(),
    })),
    transcodeJobs: track.transcodeJobs.map((job) => ({
      id: job.id,
      sourceAssetId: job.sourceAssetId,
      jobKind: job.jobKind,
      status: job.status,
      errorMessage: job.errorMessage,
      queuedAt: job.queuedAt.toISOString(),
      startedAt: job.startedAt?.toISOString() ?? null,
      finishedAt: job.finishedAt?.toISOString() ?? null,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    })),
  };
}

export function normalizeTrackNullableText(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeTrackDurationMs(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  return Math.round(value);
}

export function normalizeTrackPreviewSeconds(
  value: number | null | undefined,
  fallback: number,
) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return Math.min(
      MAX_TRACK_PREVIEW_SECONDS,
      Math.max(MIN_TRACK_PREVIEW_SECONDS, Math.round(fallback)),
    );
  }

  return Math.min(
    MAX_TRACK_PREVIEW_SECONDS,
    Math.max(MIN_TRACK_PREVIEW_SECONDS, Math.round(value)),
  );
}

export function resolveTrackPreviewValues(input: {
  previewMode: PreviewMode | null | undefined;
  previewSeconds: number | null | undefined;
  fallbackMode: PreviewMode;
  fallbackSeconds: number;
}) {
  const resolvedMode = input.previewMode ?? input.fallbackMode;
  if (resolvedMode === "FULL" || resolvedMode === "NONE") {
    return {
      previewMode: resolvedMode,
      previewSeconds: null,
    };
  }

  return {
    previewMode: resolvedMode,
    previewSeconds: normalizeTrackPreviewSeconds(
      input.previewSeconds,
      input.fallbackSeconds,
    ),
  };
}
