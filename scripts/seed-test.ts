import {
  AssetRole,
  DeliveryFormat,
  EmailStatus,
  MembershipRole,
  OrderStatus,
  PreviewMode,
  PricingMode,
  ReleaseStatus,
  ReleaseType,
  StoreStatus,
  TranscodeJobKind,
  TranscodeStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

const FIXTURE_NOW = new Date("2026-01-15T12:00:00.000Z");
const RELEASED_AT = new Date("2025-10-01T12:00:00.000Z");
const PAID_AT = new Date("2026-01-10T15:30:00.000Z");
const EXPIRED_AT = new Date("2020-01-01T00:00:00.000Z");
const REVOKED_AT = new Date("2026-01-12T09:00:00.000Z");
const FUTURE_AT = new Date("2099-01-01T00:00:00.000Z");

const IDS = {
  adminUser: "user_test_admin",
  organization: "org_test_main",
  membership: "membership_test_owner",
  artist: "artist_test_main",
  storeSettings: "store_settings_test_main",
  releases: {
    free: "release_test_free",
    fixed: "release_test_fixed",
    pwyw: "release_test_pwyw",
    lossyOnly: "release_test_lossy_only",
  },
  customers: {
    paid: "customer_test_paid",
    failed: "customer_test_failed",
    revoked: "customer_test_revoked",
    expired: "customer_test_expired",
  },
  orders: {
    free: "order_test_free_success",
    fixed: "order_test_fixed_success",
    failed: "order_test_failed",
    revoked: "order_test_revoked_access",
    expired: "order_test_expired_access",
  },
  libraryTokens: {
    valid: "buyer_library_token_test_valid",
    revoked: "buyer_library_token_test_revoked",
    expired: "buyer_library_token_test_expired",
  },
} as const;

const LIBRARY_TOKENS = {
  valid: "test_library_valid_paid",
  revoked: "test_library_revoked",
  expired: "test_library_expired",
} as const;

const ENTITLEMENT_TOKENS = {
  freeMp3: "test_entitlement_free_mp3",
  fixedFlac: "test_entitlement_fixed_flac",
  fixedMp3: "test_entitlement_fixed_mp3",
  failedFixedMp3: "test_entitlement_failed_fixed_mp3",
  revokedFixedFlac: "test_entitlement_revoked_fixed_flac",
  expiredFixedFlac: "test_entitlement_expired_fixed_flac",
} as const;

type ReleaseFixture = {
  key: keyof typeof IDS.releases;
  title: string;
  slug: string;
  releaseType: (typeof ReleaseType)[keyof typeof ReleaseType];
  pricingMode: (typeof PricingMode)[keyof typeof PricingMode];
  priceCents: number;
  fixedPriceCents: number | null;
  minimumPriceCents: number | null;
  deliveryFormats: Array<(typeof DeliveryFormat)[keyof typeof DeliveryFormat]>;
  isLossyOnly: boolean;
  trackTitle: string;
  trackDurationMs: number;
};

const releaseFixtures: ReleaseFixture[] = [
  {
    key: "free",
    title: "Test Free Release",
    slug: "free-release",
    releaseType: ReleaseType.SINGLE,
    pricingMode: PricingMode.FREE,
    priceCents: 0,
    fixedPriceCents: null,
    minimumPriceCents: null,
    deliveryFormats: [DeliveryFormat.MP3, DeliveryFormat.M4A, DeliveryFormat.FLAC],
    isLossyOnly: false,
    trackTitle: "Open Door",
    trackDurationMs: 184_000,
  },
  {
    key: "fixed",
    title: "Test Fixed Release",
    slug: "fixed-release",
    releaseType: ReleaseType.EP,
    pricingMode: PricingMode.FIXED,
    priceCents: 700,
    fixedPriceCents: 700,
    minimumPriceCents: null,
    deliveryFormats: [DeliveryFormat.MP3, DeliveryFormat.M4A, DeliveryFormat.FLAC],
    isLossyOnly: false,
    trackTitle: "Known Quantity",
    trackDurationMs: 217_000,
  },
  {
    key: "pwyw",
    title: "Test PWYW Release",
    slug: "pwyw-release",
    releaseType: ReleaseType.ALBUM,
    pricingMode: PricingMode.PWYW,
    priceCents: 300,
    fixedPriceCents: null,
    minimumPriceCents: 300,
    deliveryFormats: [DeliveryFormat.MP3, DeliveryFormat.M4A, DeliveryFormat.FLAC],
    isLossyOnly: false,
    trackTitle: "Name Your Price",
    trackDurationMs: 243_000,
  },
  {
    key: "lossyOnly",
    title: "Test Lossy Only Release",
    slug: "lossy-only-release",
    releaseType: ReleaseType.DEMO,
    pricingMode: PricingMode.FIXED,
    priceCents: 500,
    fixedPriceCents: 500,
    minimumPriceCents: null,
    deliveryFormats: [DeliveryFormat.MP3, DeliveryFormat.M4A],
    isLossyOnly: true,
    trackTitle: "Compressed Memory",
    trackDurationMs: 199_000,
  },
];

function assertTestEnvironment() {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  if (!databaseUrl.includes("merchtable_test")) {
    throw new Error(
      "Refusing to seed test data: DATABASE_URL must point at merchtable_test.",
    );
  }

  if (process.env.EMAIL_PROVIDER !== "mock") {
    throw new Error("Refusing to seed test data: EMAIL_PROVIDER must be mock.");
  }
}

async function resetDatabase() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "TranscodeOutput",
      "TranscodeJob",
      "DownloadEntitlement",
      "OrderItem",
      "Order",
      "BuyerLibraryToken",
      "ReleaseFile",
      "TrackAsset",
      "ReleaseTrack",
      "Release",
      "StoreSettings",
      "Customer",
      "Artist",
      "Membership",
      "StorageMigrationRun",
      "Organization",
      "Session",
      "Account",
      "Verification",
      "SetupWizardState",
      "SetupToken",
      "User"
    RESTART IDENTITY CASCADE
  `);
}

function releasePath(slug: string, fileName: string) {
  return `test/releases/${slug}/${fileName}`;
}

function trackIdFor(key: keyof typeof IDS.releases) {
  return `track_test_${key}_01`;
}

function assetIdFor(key: keyof typeof IDS.releases, role: string, format: string) {
  return `asset_test_${key}_${role}_${format}`;
}

function releaseFileIdFor(key: keyof typeof IDS.releases, format: string) {
  return `release_file_test_${key}_${format}`;
}

async function seedStoreBaseline() {
  await prisma.user.create({
    data: {
      id: IDS.adminUser,
      email: "admin@example.test",
      name: "Test Admin",
      emailVerified: true,
      createdAt: FIXTURE_NOW,
      updatedAt: FIXTURE_NOW,
    },
  });

  await prisma.organization.create({
    data: {
      id: IDS.organization,
      name: "Merch Table Test Store",
      slug: "test-store",
      ownerId: IDS.adminUser,
      createdAt: FIXTURE_NOW,
      updatedAt: FIXTURE_NOW,
    },
  });

  await prisma.membership.create({
    data: {
      id: IDS.membership,
      userId: IDS.adminUser,
      organizationId: IDS.organization,
      role: MembershipRole.OWNER,
      createdAt: FIXTURE_NOW,
      updatedAt: FIXTURE_NOW,
    },
  });

  await prisma.artist.create({
    data: {
      id: IDS.artist,
      organizationId: IDS.organization,
      ownerId: IDS.adminUser,
      name: "Test Artist",
      slug: "test-artist",
      location: "Detroit, MI",
      bio: "Deterministic artist fixture for integration and E2E tests.",
      createdAt: FIXTURE_NOW,
      updatedAt: FIXTURE_NOW,
    },
  });
}

async function seedReleases() {
  for (const fixture of releaseFixtures) {
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

    await prisma.trackAsset.createMany({
      data: [
        {
          id: assetIdFor(fixture.key, "master", fixture.isLossyOnly ? "mp3" : "flac"),
          trackId,
          storageKey: releasePath(
            fixture.slug,
            `track-01/master.${fixture.isLossyOnly ? "mp3" : "flac"}`,
          ),
          format: fixture.isLossyOnly ? "mp3" : "flac",
          mimeType: fixture.isLossyOnly ? "audio/mpeg" : "audio/flac",
          fileSizeBytes: fixture.isLossyOnly ? 5_200_000 : 42_000_000,
          bitrateKbps: fixture.isLossyOnly ? 320 : null,
          sampleRateHz: 44_100,
          channels: 2,
          isLossless: !fixture.isLossyOnly,
          assetRole: AssetRole.MASTER,
          createdAt: FIXTURE_NOW,
          updatedAt: FIXTURE_NOW,
        },
        {
          id: assetIdFor(fixture.key, "preview", "mp3"),
          trackId,
          storageKey: releasePath(fixture.slug, "track-01/preview.mp3"),
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
        {
          id: assetIdFor(fixture.key, "delivery", "mp3"),
          trackId,
          storageKey: releasePath(fixture.slug, "track-01/delivery.mp3"),
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
        },
        ...(fixture.isLossyOnly
          ? []
          : [
              {
                id: assetIdFor(fixture.key, "delivery", "flac"),
                trackId,
                storageKey: releasePath(fixture.slug, "track-01/delivery.flac"),
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
            ]),
      ],
    });

    await prisma.releaseFile.createMany({
      data: [
        {
          id: releaseFileIdFor(fixture.key, "mp3"),
          releaseId,
          fileName: `01 - ${fixture.trackTitle}.mp3`,
          storageKey: releasePath(fixture.slug, "track-01/delivery.mp3"),
          mimeType: "audio/mpeg",
          sizeBytes: 6_100_000,
          sortOrder: 0,
          createdAt: FIXTURE_NOW,
          updatedAt: FIXTURE_NOW,
        },
        ...(fixture.isLossyOnly
          ? []
          : [
              {
                id: releaseFileIdFor(fixture.key, "flac"),
                releaseId,
                fileName: `01 - ${fixture.trackTitle}.flac`,
                storageKey: releasePath(fixture.slug, "track-01/delivery.flac"),
                mimeType: "audio/flac",
                sizeBytes: 38_500_000,
                sortOrder: 1,
                createdAt: FIXTURE_NOW,
                updatedAt: FIXTURE_NOW,
              },
            ]),
      ],
    });

    await prisma.release.update({
      where: { id: releaseId },
      data: { featuredTrackId: trackId },
    });
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

async function createOrder(input: {
  id: string;
  customerId: string;
  orderNumber: string;
  status: (typeof OrderStatus)[keyof typeof OrderStatus];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  checkoutSessionId: string | null;
  paymentIntentId: string | null;
  emailStatus: (typeof EmailStatus)[keyof typeof EmailStatus];
  emailSentAt: Date | null;
  paidAt: Date | null;
  releaseId: string;
  lineNumber: number;
  unitPriceCents: number;
}) {
  await prisma.order.create({
    data: {
      id: input.id,
      organizationId: IDS.organization,
      customerId: input.customerId,
      orderNumber: input.orderNumber,
      status: input.status,
      currency: "USD",
      subtotalCents: input.subtotalCents,
      taxCents: input.taxCents,
      totalCents: input.totalCents,
      checkoutSessionId: input.checkoutSessionId,
      paymentIntentId: input.paymentIntentId,
      taxCentsFromStripe: input.taxCents,
      emailStatus: input.emailStatus,
      emailSentAt: input.emailSentAt,
      paidAt: input.paidAt,
      createdAt: input.paidAt ?? FIXTURE_NOW,
      updatedAt: FIXTURE_NOW,
    },
  });

  await prisma.orderItem.create({
    data: {
      id: `${input.id}_item_${input.lineNumber}`,
      orderId: input.id,
      releaseId: input.releaseId,
      lineNumber: input.lineNumber,
      quantity: 1,
      unitPriceCents: input.unitPriceCents,
      totalPriceCents: input.unitPriceCents,
      createdAt: input.paidAt ?? FIXTURE_NOW,
      updatedAt: FIXTURE_NOW,
    },
  });
}

async function createEntitlement(input: {
  id: string;
  customerId: string;
  releaseId: string;
  releaseFileId: string;
  orderId: string;
  token: string;
  expiresAt: Date | null;
  redeemedAt?: Date | null;
}) {
  await prisma.downloadEntitlement.create({
    data: {
      id: input.id,
      customerId: input.customerId,
      releaseId: input.releaseId,
      releaseFileId: input.releaseFileId,
      orderItemId: `${input.orderId}_item_1`,
      token: input.token,
      expiresAt: input.expiresAt,
      redeemedAt: input.redeemedAt ?? null,
      createdAt: PAID_AT,
      updatedAt: FIXTURE_NOW,
    },
  });
}

async function seedCustomersOrdersAndTokens() {
  await prisma.customer.createMany({
    data: [
      {
        id: IDS.customers.paid,
        organizationId: IDS.organization,
        email: "paid@example.test",
        name: "Paid Customer",
        createdAt: FIXTURE_NOW,
        updatedAt: FIXTURE_NOW,
      },
      {
        id: IDS.customers.failed,
        organizationId: IDS.organization,
        email: "failed@example.test",
        name: "Failed Customer",
        createdAt: FIXTURE_NOW,
        updatedAt: FIXTURE_NOW,
      },
      {
        id: IDS.customers.revoked,
        organizationId: IDS.organization,
        email: "revoked@example.test",
        name: "Revoked Customer",
        createdAt: FIXTURE_NOW,
        updatedAt: FIXTURE_NOW,
      },
      {
        id: IDS.customers.expired,
        organizationId: IDS.organization,
        email: "expired@example.test",
        name: "Expired Customer",
        createdAt: FIXTURE_NOW,
        updatedAt: FIXTURE_NOW,
      },
    ],
  });

  await createOrder({
    id: IDS.orders.free,
    customerId: IDS.customers.paid,
    orderNumber: "FREE-TEST-0001",
    status: OrderStatus.FULFILLED,
    subtotalCents: 0,
    taxCents: 0,
    totalCents: 0,
    checkoutSessionId: null,
    paymentIntentId: null,
    emailStatus: EmailStatus.SENT,
    emailSentAt: PAID_AT,
    paidAt: PAID_AT,
    releaseId: IDS.releases.free,
    lineNumber: 1,
    unitPriceCents: 0,
  });

  await createOrder({
    id: IDS.orders.fixed,
    customerId: IDS.customers.paid,
    orderNumber: "STRIPE-TEST-0001",
    status: OrderStatus.PAID,
    subtotalCents: 700,
    taxCents: 42,
    totalCents: 742,
    checkoutSessionId: "cs_test_seed_fixed_success",
    paymentIntentId: "pi_test_seed_fixed_success",
    emailStatus: EmailStatus.SENT,
    emailSentAt: PAID_AT,
    paidAt: PAID_AT,
    releaseId: IDS.releases.fixed,
    lineNumber: 1,
    unitPriceCents: 700,
  });

  await createOrder({
    id: IDS.orders.failed,
    customerId: IDS.customers.failed,
    orderNumber: "STRIPE-TEST-FAILED-0001",
    status: OrderStatus.CANCELED,
    subtotalCents: 700,
    taxCents: 0,
    totalCents: 700,
    checkoutSessionId: "cs_test_seed_fixed_failed",
    paymentIntentId: null,
    emailStatus: EmailStatus.FAILED,
    emailSentAt: null,
    paidAt: null,
    releaseId: IDS.releases.fixed,
    lineNumber: 1,
    unitPriceCents: 700,
  });

  await createOrder({
    id: IDS.orders.revoked,
    customerId: IDS.customers.revoked,
    orderNumber: "STRIPE-TEST-REVOKED-0001",
    status: OrderStatus.PAID,
    subtotalCents: 700,
    taxCents: 42,
    totalCents: 742,
    checkoutSessionId: "cs_test_seed_revoked",
    paymentIntentId: "pi_test_seed_revoked",
    emailStatus: EmailStatus.SENT,
    emailSentAt: PAID_AT,
    paidAt: PAID_AT,
    releaseId: IDS.releases.fixed,
    lineNumber: 1,
    unitPriceCents: 700,
  });

  await createOrder({
    id: IDS.orders.expired,
    customerId: IDS.customers.expired,
    orderNumber: "STRIPE-TEST-EXPIRED-0001",
    status: OrderStatus.PAID,
    subtotalCents: 700,
    taxCents: 42,
    totalCents: 742,
    checkoutSessionId: "cs_test_seed_expired",
    paymentIntentId: "pi_test_seed_expired",
    emailStatus: EmailStatus.SENT,
    emailSentAt: PAID_AT,
    paidAt: PAID_AT,
    releaseId: IDS.releases.fixed,
    lineNumber: 1,
    unitPriceCents: 700,
  });

  await createEntitlement({
    id: "entitlement_test_free_mp3",
    customerId: IDS.customers.paid,
    releaseId: IDS.releases.free,
    releaseFileId: releaseFileIdFor("free", "mp3"),
    orderId: IDS.orders.free,
    token: ENTITLEMENT_TOKENS.freeMp3,
    expiresAt: null,
  });

  await createEntitlement({
    id: "entitlement_test_fixed_flac",
    customerId: IDS.customers.paid,
    releaseId: IDS.releases.fixed,
    releaseFileId: releaseFileIdFor("fixed", "flac"),
    orderId: IDS.orders.fixed,
    token: ENTITLEMENT_TOKENS.fixedFlac,
    expiresAt: null,
  });

  await createEntitlement({
    id: "entitlement_test_fixed_mp3",
    customerId: IDS.customers.paid,
    releaseId: IDS.releases.fixed,
    releaseFileId: releaseFileIdFor("fixed", "mp3"),
    orderId: IDS.orders.fixed,
    token: ENTITLEMENT_TOKENS.fixedMp3,
    expiresAt: FUTURE_AT,
  });

  await createEntitlement({
    id: "entitlement_test_failed_fixed_mp3",
    customerId: IDS.customers.failed,
    releaseId: IDS.releases.fixed,
    releaseFileId: releaseFileIdFor("fixed", "mp3"),
    orderId: IDS.orders.failed,
    token: ENTITLEMENT_TOKENS.failedFixedMp3,
    expiresAt: null,
  });

  await createEntitlement({
    id: "entitlement_test_revoked_fixed_flac",
    customerId: IDS.customers.revoked,
    releaseId: IDS.releases.fixed,
    releaseFileId: releaseFileIdFor("fixed", "flac"),
    orderId: IDS.orders.revoked,
    token: ENTITLEMENT_TOKENS.revokedFixedFlac,
    expiresAt: null,
  });

  await createEntitlement({
    id: "entitlement_test_expired_fixed_flac",
    customerId: IDS.customers.expired,
    releaseId: IDS.releases.fixed,
    releaseFileId: releaseFileIdFor("fixed", "flac"),
    orderId: IDS.orders.expired,
    token: ENTITLEMENT_TOKENS.expiredFixedFlac,
    expiresAt: EXPIRED_AT,
  });

  await prisma.buyerLibraryToken.createMany({
    data: [
      {
        id: IDS.libraryTokens.valid,
        organizationId: IDS.organization,
        customerId: IDS.customers.paid,
        token: LIBRARY_TOKENS.valid,
        expiresAt: null,
        revokedAt: null,
        lastUsedAt: null,
        accessCount: 0,
        createdAt: FIXTURE_NOW,
        updatedAt: FIXTURE_NOW,
      },
      {
        id: IDS.libraryTokens.revoked,
        organizationId: IDS.organization,
        customerId: IDS.customers.revoked,
        token: LIBRARY_TOKENS.revoked,
        expiresAt: null,
        revokedAt: REVOKED_AT,
        lastUsedAt: null,
        accessCount: 0,
        createdAt: FIXTURE_NOW,
        updatedAt: FIXTURE_NOW,
      },
      {
        id: IDS.libraryTokens.expired,
        organizationId: IDS.organization,
        customerId: IDS.customers.expired,
        token: LIBRARY_TOKENS.expired,
        expiresAt: EXPIRED_AT,
        revokedAt: null,
        lastUsedAt: null,
        accessCount: 0,
        createdAt: FIXTURE_NOW,
        updatedAt: FIXTURE_NOW,
      },
    ],
  });
}

async function seedTranscodeFixtures() {
  await prisma.transcodeJob.create({
    data: {
      id: "transcode_job_test_succeeded",
      organizationId: IDS.organization,
      trackId: trackIdFor("fixed"),
      sourceAssetId: assetIdFor("fixed", "master", "flac"),
      jobKind: TranscodeJobKind.DELIVERY_FORMATS,
      attemptCount: 1,
      status: TranscodeStatus.SUCCEEDED,
      queuedAt: new Date("2026-01-10T14:00:00.000Z"),
      startedAt: new Date("2026-01-10T14:00:05.000Z"),
      finishedAt: new Date("2026-01-10T14:01:00.000Z"),
      createdAt: FIXTURE_NOW,
      updatedAt: FIXTURE_NOW,
      outputs: {
        create: {
          id: "transcode_output_test_fixed_mp3",
          outputAssetId: assetIdFor("fixed", "delivery", "mp3"),
          format: "mp3",
          storageKey: releasePath("fixed-release", "track-01/delivery.mp3"),
          mimeType: "audio/mpeg",
          fileSizeBytes: 6_100_000,
          createdAt: FIXTURE_NOW,
          updatedAt: FIXTURE_NOW,
        },
      },
    },
  });

  await prisma.transcodeJob.create({
    data: {
      id: "transcode_job_test_failed",
      organizationId: IDS.organization,
      trackId: trackIdFor("pwyw"),
      sourceAssetId: assetIdFor("pwyw", "master", "flac"),
      jobKind: TranscodeJobKind.PREVIEW_CLIP,
      attemptCount: 3,
      status: TranscodeStatus.FAILED,
      errorMessage: "Deterministic failed transcode fixture.",
      queuedAt: new Date("2026-01-11T14:00:00.000Z"),
      startedAt: new Date("2026-01-11T14:00:05.000Z"),
      finishedAt: new Date("2026-01-11T14:02:00.000Z"),
      createdAt: FIXTURE_NOW,
      updatedAt: FIXTURE_NOW,
    },
  });
}

async function printManifest() {
  const [releaseCount, trackCount, orderCount, libraryTokenCount] =
    await Promise.all([
      prisma.release.count(),
      prisma.releaseTrack.count(),
      prisma.order.count(),
      prisma.buyerLibraryToken.count(),
    ]);

  console.log("Seeded deterministic test data:");
  console.log(`- Releases: ${releaseCount}`);
  console.log(`- Tracks: ${trackCount}`);
  console.log(`- Orders: ${orderCount}`);
  console.log(`- Library tokens: ${libraryTokenCount}`);
  console.log("- Storefront release slugs:");
  for (const fixture of releaseFixtures) {
    console.log(`  - ${fixture.key}: /release/${fixture.slug}`);
  }
  console.log("- Buyer library tokens:");
  console.log(`  - valid: ${LIBRARY_TOKENS.valid}`);
  console.log(`  - revoked: ${LIBRARY_TOKENS.revoked}`);
  console.log(`  - expired: ${LIBRARY_TOKENS.expired}`);
  console.log("- Entitlement tokens:");
  console.log(`  - fixed flac: ${ENTITLEMENT_TOKENS.fixedFlac}`);
  console.log(`  - expired fixed flac: ${ENTITLEMENT_TOKENS.expiredFixedFlac}`);
}

async function main() {
  assertTestEnvironment();
  await resetDatabase();
  await seedStoreBaseline();
  await seedReleases();
  await seedCustomersOrdersAndTokens();
  await seedTranscodeFixtures();
  await printManifest();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
