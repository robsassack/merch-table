-- CreateEnum
CREATE TYPE "PricingMode" AS ENUM ('FREE', 'FIXED', 'PWYW');

-- CreateEnum
CREATE TYPE "PreviewMode" AS ENUM ('CLIP', 'FULL');

-- CreateEnum
CREATE TYPE "AssetRole" AS ENUM ('MASTER', 'PREVIEW', 'DELIVERY');

-- CreateEnum
CREATE TYPE "TranscodeStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "StoreStatus" AS ENUM ('SETUP', 'PRIVATE', 'PUBLIC');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- AlterTable
ALTER TABLE "Artist" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "checkoutSessionId" TEXT,
ADD COLUMN     "emailSentAt" TIMESTAMP(3),
ADD COLUMN     "emailStatus" "EmailStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "paymentIntentId" TEXT,
ADD COLUMN     "taxCentsFromStripe" INTEGER;

-- AlterTable
ALTER TABLE "Release" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "fixedPriceCents" INTEGER,
ADD COLUMN     "minimumPriceCents" INTEGER,
ADD COLUMN     "pricingMode" "PricingMode" NOT NULL DEFAULT 'FREE';

-- CreateTable
CREATE TABLE "StoreSettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "storeStatus" "StoreStatus" NOT NULL DEFAULT 'SETUP',
    "setupComplete" BOOLEAN NOT NULL DEFAULT false,
    "storeName" TEXT,
    "brandName" TEXT,
    "brandTagline" TEXT,
    "brandDescription" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "defaultPreviewMode" "PreviewMode" NOT NULL DEFAULT 'CLIP',
    "defaultPreviewSeconds" INTEGER NOT NULL DEFAULT 30,
    "contactEmail" TEXT,
    "contactName" TEXT,
    "supportEmail" TEXT,
    "websiteUrl" TEXT,
    "instagramUrl" TEXT,
    "xUrl" TEXT,
    "tiktokUrl" TEXT,
    "youtubeUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReleaseTrack" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "trackNumber" INTEGER NOT NULL,
    "durationMs" INTEGER,
    "lyrics" TEXT,
    "credits" TEXT,
    "previewMode" "PreviewMode" NOT NULL DEFAULT 'CLIP',
    "previewSeconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReleaseTrack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackAsset" (
    "id" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "bitrateKbps" INTEGER,
    "sampleRateHz" INTEGER,
    "channels" INTEGER,
    "isLossless" BOOLEAN NOT NULL DEFAULT false,
    "assetRole" "AssetRole" NOT NULL DEFAULT 'MASTER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuyerLibraryToken" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuyerLibraryToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranscodeJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "sourceAssetId" TEXT NOT NULL,
    "status" "TranscodeStatus" NOT NULL DEFAULT 'QUEUED',
    "errorMessage" TEXT,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TranscodeJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranscodeOutput" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "outputAssetId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TranscodeOutput_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoreSettings_organizationId_key" ON "StoreSettings"("organizationId");

-- CreateIndex
CREATE INDEX "ReleaseTrack_releaseId_trackNumber_idx" ON "ReleaseTrack"("releaseId", "trackNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ReleaseTrack_releaseId_trackNumber_key" ON "ReleaseTrack"("releaseId", "trackNumber");

-- CreateIndex
CREATE INDEX "TrackAsset_trackId_assetRole_idx" ON "TrackAsset"("trackId", "assetRole");

-- CreateIndex
CREATE UNIQUE INDEX "TrackAsset_trackId_storageKey_key" ON "TrackAsset"("trackId", "storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "BuyerLibraryToken_token_key" ON "BuyerLibraryToken"("token");

-- CreateIndex
CREATE INDEX "BuyerLibraryToken_customerId_idx" ON "BuyerLibraryToken"("customerId");

-- CreateIndex
CREATE INDEX "BuyerLibraryToken_organizationId_revokedAt_expiresAt_idx" ON "BuyerLibraryToken"("organizationId", "revokedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "TranscodeJob_status_queuedAt_idx" ON "TranscodeJob"("status", "queuedAt");

-- CreateIndex
CREATE INDEX "TranscodeJob_trackId_idx" ON "TranscodeJob"("trackId");

-- CreateIndex
CREATE INDEX "TranscodeOutput_outputAssetId_idx" ON "TranscodeOutput"("outputAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "TranscodeOutput_jobId_format_key" ON "TranscodeOutput"("jobId", "format");

-- CreateIndex
CREATE UNIQUE INDEX "Order_checkoutSessionId_key" ON "Order"("checkoutSessionId");

-- AddForeignKey
ALTER TABLE "StoreSettings" ADD CONSTRAINT "StoreSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseTrack" ADD CONSTRAINT "ReleaseTrack_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackAsset" ADD CONSTRAINT "TrackAsset_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "ReleaseTrack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerLibraryToken" ADD CONSTRAINT "BuyerLibraryToken_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerLibraryToken" ADD CONSTRAINT "BuyerLibraryToken_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranscodeJob" ADD CONSTRAINT "TranscodeJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranscodeJob" ADD CONSTRAINT "TranscodeJob_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "ReleaseTrack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranscodeJob" ADD CONSTRAINT "TranscodeJob_sourceAssetId_fkey" FOREIGN KEY ("sourceAssetId") REFERENCES "TrackAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranscodeOutput" ADD CONSTRAINT "TranscodeOutput_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "TranscodeJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranscodeOutput" ADD CONSTRAINT "TranscodeOutput_outputAssetId_fkey" FOREIGN KEY ("outputAssetId") REFERENCES "TrackAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

