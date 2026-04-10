ALTER TABLE "StoreSettings"
ADD COLUMN IF NOT EXISTS "defaultReleaseArtistId" TEXT,
ADD COLUMN IF NOT EXISTS "defaultReleasePricingMode" "PricingMode",
ADD COLUMN IF NOT EXISTS "defaultReleaseStatus" "ReleaseStatus",
ADD COLUMN IF NOT EXISTS "defaultReleaseType" "ReleaseType",
ADD COLUMN IF NOT EXISTS "defaultReleasePwywMinimumCents" INTEGER,
ADD COLUMN IF NOT EXISTS "defaultReleaseAllowFreeCheckout" BOOLEAN;
