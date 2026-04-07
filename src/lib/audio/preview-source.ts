export type StorefrontPreviewMode = "CLIP" | "FULL";

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

export function resolveStorefrontPreviewAsset(input: {
  previewMode: StorefrontPreviewMode;
  assets: StorefrontPreviewAsset[];
}) {
  const sortedAssets = sortPreviewAssetsByUpdatedAtDesc(input.assets);
  const previewAsset = sortedAssets.find((asset) => asset.assetRole === "PREVIEW") ?? null;
  const masterAsset = sortedAssets.find((asset) => asset.assetRole === "MASTER") ?? null;

  if (input.previewMode === "FULL") {
    return masterAsset ?? previewAsset;
  }

  return previewAsset;
}
