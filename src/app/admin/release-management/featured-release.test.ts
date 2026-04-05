import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ReleaseRecord } from "./types";
import {
  isReleaseEligibleForFeatured,
  resolveNormalizedFeaturedReleaseId,
} from "./featured-release";

function createReleaseRecord(input: {
  id: string;
  status?: ReleaseRecord["status"];
  deletedAt?: string | null;
}): ReleaseRecord {
  return {
    id: input.id,
    artistId: "artist-1",
    title: `Release ${input.id}`,
    slug: `release-${input.id}`,
    description: null,
    coverImageUrl: null,
    pricingMode: "FREE",
    fixedPriceCents: null,
    minimumPriceCents: null,
    deliveryFormats: ["MP3", "M4A", "FLAC"],
    priceCents: 0,
    currency: "USD",
    status: input.status ?? "PUBLISHED",
    releaseDate: "2026-04-01T00:00:00.000Z",
    publishedAt: "2026-04-01T00:00:00.000Z",
    deletedAt: input.deletedAt ?? null,
    isLossyOnly: false,
    qualityDisclosureRequired: false,
    hasLosslessMasters: true,
    trackAssetCount: 0,
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    artist: {
      id: "artist-1",
      name: "Artist",
      deletedAt: null,
    },
    tracks: [],
    _count: {
      tracks: 0,
      files: 0,
      orderItems: 0,
    },
  };
}

describe("featured release helpers", () => {
  it("treats only published + non-deleted releases as eligible", () => {
    const published = createReleaseRecord({ id: "pub" });
    const draft = createReleaseRecord({ id: "draft", status: "DRAFT" });
    const archived = createReleaseRecord({ id: "arch", status: "ARCHIVED" });
    const deleted = createReleaseRecord({ id: "del", deletedAt: "2026-04-05T10:00:00.000Z" });

    assert.equal(isReleaseEligibleForFeatured(published), true);
    assert.equal(isReleaseEligibleForFeatured(draft), false);
    assert.equal(isReleaseEligibleForFeatured(archived), false);
    assert.equal(isReleaseEligibleForFeatured(deleted), false);
  });

  it("keeps the current featured release when it remains eligible", () => {
    const releases = [
      createReleaseRecord({ id: "newest" }),
      createReleaseRecord({ id: "current-featured" }),
    ];

    const resolved = resolveNormalizedFeaturedReleaseId({
      currentFeaturedReleaseId: "current-featured",
      releases,
    });

    assert.equal(resolved, "current-featured");
  });

  it("falls back to newest eligible release when current featured is disabled", () => {
    const releases = [
      createReleaseRecord({ id: "newest-enabled" }),
      createReleaseRecord({ id: "disabled-featured", status: "ARCHIVED" }),
      createReleaseRecord({ id: "older-enabled" }),
    ];

    const resolved = resolveNormalizedFeaturedReleaseId({
      currentFeaturedReleaseId: "disabled-featured",
      releases,
    });

    assert.equal(resolved, "newest-enabled");
  });

  it("returns null when no releases are eligible", () => {
    const releases = [
      createReleaseRecord({ id: "draft-1", status: "DRAFT" }),
      createReleaseRecord({ id: "arch-1", status: "ARCHIVED" }),
      createReleaseRecord({ id: "del-1", deletedAt: "2026-04-05T10:00:00.000Z" }),
    ];

    const resolved = resolveNormalizedFeaturedReleaseId({
      currentFeaturedReleaseId: "draft-1",
      releases,
    });

    assert.equal(resolved, null);
  });

  it("auto-selects the first eligible release when featured is empty", () => {
    const releases = [
      createReleaseRecord({ id: "newest-enabled" }),
      createReleaseRecord({ id: "older-enabled" }),
    ];

    const resolved = resolveNormalizedFeaturedReleaseId({
      currentFeaturedReleaseId: null,
      releases,
    });

    assert.equal(resolved, "newest-enabled");
  });
});
