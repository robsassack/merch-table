import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveStorefrontPreviewAsset } from "@/lib/audio/preview-source";

function makeAsset(input: {
  id: string;
  assetRole: "MASTER" | "PREVIEW" | "DELIVERY";
  updatedAt: string;
}) {
  return {
    id: input.id,
    assetRole: input.assetRole,
    updatedAt: input.updatedAt,
    format: "mp3",
    isLossless: false,
    storageKey: `tracks/${input.id}.mp3`,
    mimeType: "audio/mpeg",
  };
}

describe("resolveStorefrontPreviewAsset", () => {
  it("returns preview asset for CLIP mode", () => {
    const result = resolveStorefrontPreviewAsset({
      previewMode: "CLIP",
      assets: [
        makeAsset({
          id: "master-new",
          assetRole: "MASTER",
          updatedAt: "2026-04-06T12:10:00.000Z",
        }),
        makeAsset({
          id: "preview-old",
          assetRole: "PREVIEW",
          updatedAt: "2026-04-06T12:00:00.000Z",
        }),
      ],
    });

    assert.equal(result?.id, "preview-old");
  });

  it("returns newest master for FULL mode", () => {
    const result = resolveStorefrontPreviewAsset({
      previewMode: "FULL",
      assets: [
        makeAsset({
          id: "master-old",
          assetRole: "MASTER",
          updatedAt: "2026-04-06T12:00:00.000Z",
        }),
        makeAsset({
          id: "preview-new",
          assetRole: "PREVIEW",
          updatedAt: "2026-04-06T12:20:00.000Z",
        }),
        makeAsset({
          id: "master-new",
          assetRole: "MASTER",
          updatedAt: "2026-04-06T12:30:00.000Z",
        }),
      ],
    });

    assert.equal(result?.id, "master-new");
  });

  it("falls back to preview when FULL mode has no master", () => {
    const result = resolveStorefrontPreviewAsset({
      previewMode: "FULL",
      assets: [
        makeAsset({
          id: "preview-track",
          assetRole: "PREVIEW",
          updatedAt: "2026-04-06T12:00:00.000Z",
        }),
      ],
    });

    assert.equal(result?.id, "preview-track");
  });

  it("falls back to master when CLIP mode has no preview yet", () => {
    const result = resolveStorefrontPreviewAsset({
      previewMode: "CLIP",
      assets: [
        makeAsset({
          id: "master-track",
          assetRole: "MASTER",
          updatedAt: "2026-04-06T12:00:00.000Z",
        }),
      ],
    });

    assert.equal(result?.id, "master-track");
  });

  it("returns null when no playable source exists", () => {
    const result = resolveStorefrontPreviewAsset({
      previewMode: "CLIP",
      assets: [makeAsset({ id: "delivery-only", assetRole: "DELIVERY", updatedAt: "2026-04-06T12:00:00.000Z" })],
    });

    assert.equal(result, null);
  });
});
