export type StorefrontPreviewMode = "CLIP" | "FULL" | "NONE";

export type StorefrontPreviewAsset = {
  id: string;
  assetRole: "MASTER" | "PREVIEW" | "DELIVERY";
  format: string;
  isLossless: boolean;
  updatedAt: Date | string;
  storageKey: string;
  mimeType: string | null;
};

function sortPreviewAssetsByUpdatedAtDesc(assets: StorefrontPreviewAsset[]) {
  return [...assets].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

function isMp3Asset(asset: StorefrontPreviewAsset) {
  const normalizedFormat = asset.format.trim().toLowerCase();
  const normalizedMimeType = asset.mimeType?.trim().toLowerCase() ?? "";
  return (
    normalizedFormat === "mp3" ||
    normalizedFormat === "mpeg" ||
    normalizedMimeType === "audio/mpeg" ||
    normalizedMimeType === "audio/mp3"
  );
}

export function resolveStorefrontPreviewAsset(input: {
  previewMode: StorefrontPreviewMode;
  assets: StorefrontPreviewAsset[];
}) {
  if (input.previewMode === "NONE") {
    return null;
  }

  const sortedAssets = sortPreviewAssetsByUpdatedAtDesc(input.assets);
  const previewAsset = sortedAssets.find((asset) => asset.assetRole === "PREVIEW") ?? null;
  const masterAsset = sortedAssets.find((asset) => asset.assetRole === "MASTER") ?? null;
  const fullLengthMp3Asset =
    sortedAssets.find((asset) => asset.assetRole !== "PREVIEW" && isMp3Asset(asset)) ?? null;

  if (input.previewMode === "FULL") {
    return fullLengthMp3Asset ?? masterAsset ?? previewAsset;
  }

  return previewAsset ?? masterAsset;
}
