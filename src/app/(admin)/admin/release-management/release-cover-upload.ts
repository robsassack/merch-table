import { ALLOWED_COVER_MIME_TYPES } from "./constants";
import type { CoverUploadUrlResponse } from "./types";
import { buildPaletteFromDominant } from "@/lib/release-artwork-palette-builder";
import { pickDominantArtworkColor } from "@/lib/release-artwork-dominant";
import { serializeReleasePaletteJson } from "@/lib/release-artwork-palette-shared";

async function loadImageForPalette(src: string) {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.decoding = "async";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Could not load cover image for palette."));
    image.src = src;
  });
  return image;
}

export async function resolveArtworkPaletteJsonFromImageSource(src: string) {
  try {
    const image = await loadImageForPalette(src);
    const colorThief = await import("colorthief");
    const color = await colorThief.getColor(image, { quality: 10 });
    const paletteColors = await colorThief
      .getPalette(image, { colorCount: 8, quality: 10 })
      .catch(() => null);
    const swatches = [
      color?.rgb?.(),
      ...(Array.isArray(paletteColors) ? paletteColors.map((entry) => entry?.rgb?.()) : []),
    ]
      .filter(
        (entry): entry is { r: number; g: number; b: number } =>
          Boolean(
            entry &&
              Number.isFinite(entry.r) &&
              Number.isFinite(entry.g) &&
              Number.isFinite(entry.b),
          ),
      )
      .map((entry) => ({ r: entry.r, g: entry.g, b: entry.b }));
    const rgb = pickDominantArtworkColor(swatches);
    if (!rgb) {
      return null;
    }

    return serializeReleasePaletteJson(buildPaletteFromDominant(rgb));
  } catch {
    return null;
  }
}

export async function resolveArtworkPaletteJsonFromCoverFile(file: File) {
  const objectUrl = URL.createObjectURL(file);
  try {
    return await resolveArtworkPaletteJsonFromImageSource(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

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
