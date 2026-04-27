import {
  AssetRole,
  PreviewMode,
  PricingMode,
  ReleaseStatus,
  ReleaseType,
  StoreStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

import {
  assetIdFor,
  FIXTURE_NOW,
  IDS,
  releaseFileIdFor,
  releaseFixtures,
  releasePath,
  RELEASED_AT,
  trackIdFor,
  type ReleaseKey,
} from "./fixtures";

function masterAssetFor(input: {
  key: ReleaseKey;
  slug: string;
  trackId: string;
  isLossyOnly: boolean;
}) {
  const format = input.isLossyOnly ? "mp3" : "flac";

  return {
    id: assetIdFor(input.key, "master", format),
    trackId: input.trackId,
    storageKey: releasePath(input.slug, `track-01/master.${format}`),
    format,
    mimeType: input.isLossyOnly ? "audio/mpeg" : "audio/flac",
    fileSizeBytes: input.isLossyOnly ? 5_200_000 : 42_000_000,
    bitrateKbps: input.isLossyOnly ? 320 : null,
    sampleRateHz: 44_100,
    channels: 2,
    isLossless: !input.isLossyOnly,
    assetRole: AssetRole.MASTER,
    createdAt: FIXTURE_NOW,
    updatedAt: FIXTURE_NOW,
  };
}

function deliveryAssetsFor(input: {
  key: ReleaseKey;
  slug: string;
  trackId: string;
  isLossyOnly: boolean;
}) {
  const mp3Asset = {
    id: assetIdFor(input.key, "delivery", "mp3"),
    trackId: input.trackId,
    storageKey: releasePath(input.slug, "track-01/delivery.mp3"),
    format: "mp3",
    mimeType: "audio/mpeg",
    fileSizeBytes: 6_100_000,
    bitrateKbps: 320,
    sampleRateHz: 44_100,
    channels: 2,
    isLossless: false,
    assetRole: AssetRole.DELIVERY,
    createdAt: FIXTURE_NOW,
    updatedAt: FIXTURE_NOW,
  };

  if (input.isLossyOnly) {
    return [mp3Asset];
  }

  return [
    mp3Asset,
    {
      id: assetIdFor(input.key, "delivery", "flac"),
      trackId: input.trackId,
      storageKey: releasePath(input.slug, "track-01/delivery.flac"),
      format: "flac",
      mimeType: "audio/flac",
      fileSizeBytes: 38_500_000,
      bitrateKbps: null,
      sampleRateHz: 44_100,
      channels: 2,
      isLossless: true,
      assetRole: AssetRole.DELIVERY,
      createdAt: FIXTURE_NOW,
      updatedAt: FIXTURE_NOW,
    },
  ];
}

function releaseFilesFor(input: {
  key: ReleaseKey;
  releaseId: string;
  slug: string;
  trackTitle: string;
  isLossyOnly: boolean;
}) {
  const mp3File = {
    id: releaseFileIdFor(input.key, "mp3"),
    releaseId: input.releaseId,
    fileName: `01 - ${input.trackTitle}.mp3`,
    storageKey: releasePath(input.slug, "track-01/delivery.mp3"),
    mimeType: "audio/mpeg",
    sizeBytes: 6_100_000,
    sortOrder: 0,
    createdAt: FIXTURE_NOW,
    updatedAt: FIXTURE_NOW,
  };

  if (input.isLossyOnly) {
    return [mp3File];
  }

  return [
    mp3File,
    {
      id: releaseFileIdFor(input.key, "flac"),
      releaseId: input.releaseId,
      fileName: `01 - ${input.trackTitle}.flac`,
      storageKey: releasePath(input.slug, "track-01/delivery.flac"),
      mimeType: "audio/flac",
      sizeBytes: 38_500_000,
      sortOrder: 1,
      createdAt: FIXTURE_NOW,
      updatedAt: FIXTURE_NOW,
    },
  ];
}

async function seedReleaseAssets(input: {
  key: ReleaseKey;
  slug: string;
  trackId: string;
  isLossyOnly: boolean;
}) {
  await prisma.trackAsset.createMany({
    data: [
      masterAssetFor(input),
      {
        id: assetIdFor(input.key, "preview", "mp3"),
        trackId: input.trackId,
        storageKey: releasePath(input.slug, "track-01/preview.mp3"),
        format: "mp3",
        mimeType: "audio/mpeg",
        fileSizeBytes: 1_200_000,
        bitrateKbps: 192,
        sampleRateHz: 44_100,
        channels: 2,
        isLossless: false,
        assetRole: AssetRole.PREVIEW,
        createdAt: FIXTURE_NOW,
        updatedAt: FIXTURE_NOW,
      },
      ...deliveryAssetsFor(input),
    ],
  });
}

async function seedRelease(fixture: (typeof releaseFixtures)[number]) {
  const releaseId = IDS.releases[fixture.key];
  const trackId = trackIdFor(fixture.key);

  await prisma.release.create({
    data: {
      id: releaseId,
      organizationId: IDS.organization,
      artistId: IDS.artist,
      title: fixture.title,
      releaseType: fixture.releaseType,
      label: "Merch Table Test Fixtures",
      slug: fixture.slug,
      description: `Deterministic ${fixture.pricingMode} release fixture.`,
      coverImageUrl: "/default-artwork.png",
      artworkPaletteJson: JSON.stringify({
        background: "#f6f1e8",
        foreground: "#171412",
        accent: "#34736f",
      }),
      priceCents: fixture.priceCents,
      currency: "USD",
      pricingMode: fixture.pricingMode,
      fixedPriceCents: fixture.fixedPriceCents,
      minimumPriceCents: fixture.minimumPriceCents,
      deliveryFormats: fixture.deliveryFormats,
      isLossyOnly: fixture.isLossyOnly,
      status: ReleaseStatus.PUBLISHED,
      releaseDate: RELEASED_AT,
      publishedAt: RELEASED_AT,
      createdAt: FIXTURE_NOW,
      updatedAt: FIXTURE_NOW,
    },
  });

  await prisma.releaseTrack.create({
    data: {
      id: trackId,
      releaseId,
      title: fixture.trackTitle,
      trackNumber: 1,
      durationMs: fixture.trackDurationMs,
      lyrics: "Test lyrics fixture.",
      credits: "Written and produced for test automation.",
      previewMode: fixture.key === "pwyw" ? PreviewMode.FULL : PreviewMode.CLIP,
      previewSeconds: fixture.key === "pwyw" ? null : 30,
      createdAt: FIXTURE_NOW,
      updatedAt: FIXTURE_NOW,
    },
  });

  await seedReleaseAssets({
    key: fixture.key,
    slug: fixture.slug,
    trackId,
    isLossyOnly: fixture.isLossyOnly,
  });

  await prisma.releaseFile.createMany({
    data: releaseFilesFor({
      key: fixture.key,
      releaseId,
      slug: fixture.slug,
      trackTitle: fixture.trackTitle,
      isLossyOnly: fixture.isLossyOnly,
    }),
  });

  await prisma.release.update({
    where: { id: releaseId },
    data: { featuredTrackId: trackId },
  });
}

export async function seedReleases() {
  for (const fixture of releaseFixtures) {
    await seedRelease(fixture);
  }

  await prisma.storeSettings.create({
    data: {
      id: IDS.storeSettings,
      organizationId: IDS.organization,
      storeStatus: StoreStatus.PUBLIC,
      setupComplete: true,
      storeName: "Merch Table Test Store",
      brandName: "Merch Table Test Store",
      brandTagline: "Deterministic fixtures for confident tests.",
      brandDescription: "A stable storefront generated by npm run seed:test.",
      currency: "USD",
      defaultPreviewMode: PreviewMode.CLIP,
      defaultPreviewSeconds: 30,
      featuredReleaseId: IDS.releases.fixed,
      defaultReleaseArtistId: IDS.artist,
      defaultReleasePricingMode: PricingMode.FIXED,
      defaultReleaseStatus: ReleaseStatus.PUBLISHED,
      defaultReleaseType: ReleaseType.SINGLE,
      defaultReleasePwywMinimumCents: 300,
      defaultReleaseAllowFreeCheckout: true,
      contactEmail: "support@example.test",
      contactName: "Test Support",
      supportEmail: "support@example.test",
      websiteUrl: "https://example.test",
      createdAt: FIXTURE_NOW,
      updatedAt: FIXTURE_NOW,
    },
  });
}
