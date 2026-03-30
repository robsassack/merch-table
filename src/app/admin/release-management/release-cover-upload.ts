import { ALLOWED_COVER_MIME_TYPES } from "./constants";
import type { CoverUploadUrlResponse } from "./types";

export async function uploadReleaseCoverFile(file: File) {
  const contentType = file.type.trim().toLowerCase();
  if (!ALLOWED_COVER_MIME_TYPES.has(contentType)) {
    throw new Error("Unsupported cover image format. Use JPEG, PNG, WEBP, AVIF, or GIF.");
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
}
