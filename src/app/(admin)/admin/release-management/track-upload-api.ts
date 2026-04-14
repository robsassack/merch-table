import type {
  PreviewMode,
  TrackAssetCommitResponse,
  TrackMutationResponse,
  UploadUrlResponse,
} from "./types";
import { uploadViaSignedPut } from "./utils";

export async function createTrackForRelease(input: {
  releaseId: string;
  title: string;
  artistOverride?: string | null;
  trackNumber?: number;
  durationMs?: number | null;
  previewMode: PreviewMode;
  previewSeconds: number | null;
}) {
  const response = await fetch(`/api/admin/releases/${input.releaseId}/tracks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: input.title,
      artistOverride: input.artistOverride,
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
}

export async function updateTrackMetadataFromAudio(input: {
  releaseId: string;
  trackId: string;
  title: string;
  durationMs: number | null;
}) {
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
}

export async function uploadTrackAsset(input: {
  releaseId: string;
  trackId: string;
  file: File;
  contentType: string;
  assetRole: "MASTER" | "DELIVERY";
  onProgress?: (percent: number) => void;
}) {
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
    throw new Error(
      uploadUrlBody?.error ??
        `Could not create upload URL for "${input.file.name}" (${input.contentType || "unknown type"}).`,
    );
  }

  try {
    await uploadViaSignedPut({
      uploadUrl: uploadUrlBody.uploadUrl,
      file: input.file,
      contentType: input.contentType,
      requiredHeaders: uploadUrlBody.requiredHeaders ?? {},
      onProgress: (percent) => {
        input.onProgress?.(percent);
      },
    });
  } catch (error) {
    throw new Error(
      `Could not upload "${input.file.name}" to storage: ${error instanceof Error ? error.message : "Unknown upload error."}`,
    );
  }

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
    throw new Error(
      commitBody?.error ??
        `Upload succeeded but attaching "${input.file.name}" to the track failed.`,
    );
  }

  return commitBody;
}
