import {
  DeliveryFormat,
  PricingMode,
  ReleaseType,
} from "@/generated/prisma/client";

export const FIXTURE_NOW = new Date("2026-01-15T12:00:00.000Z");
export const RELEASED_AT = new Date("2025-10-01T12:00:00.000Z");
export const PAID_AT = new Date("2026-01-10T15:30:00.000Z");
export const EXPIRED_AT = new Date("2020-01-01T00:00:00.000Z");
export const REVOKED_AT = new Date("2026-01-12T09:00:00.000Z");
export const FUTURE_AT = new Date("2099-01-01T00:00:00.000Z");

export const IDS = {
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

export const LIBRARY_TOKENS = {
  valid: "test_library_valid_paid",
  revoked: "test_library_revoked",
  expired: "test_library_expired",
} as const;

export const ENTITLEMENT_TOKENS = {
  freeMp3: "test_entitlement_free_mp3",
  fixedFlac: "test_entitlement_fixed_flac",
  fixedMp3: "test_entitlement_fixed_mp3",
  failedFixedMp3: "test_entitlement_failed_fixed_mp3",
  revokedFixedFlac: "test_entitlement_revoked_fixed_flac",
  expiredFixedFlac: "test_entitlement_expired_fixed_flac",
} as const;

export type ReleaseKey = keyof typeof IDS.releases;

type ReleaseFixture = {
  key: ReleaseKey;
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

export const releaseFixtures: ReleaseFixture[] = [
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

export function releasePath(slug: string, fileName: string) {
  return `test/releases/${slug}/${fileName}`;
}

export function trackIdFor(key: ReleaseKey) {
  return `track_test_${key}_01`;
}

export function assetIdFor(key: ReleaseKey, role: string, format: string) {
  return `asset_test_${key}_${role}_${format}`;
}

export function releaseFileIdFor(key: ReleaseKey, format: string) {
  return `release_file_test_${key}_${format}`;
}
