ALTER TABLE "SetupWizardState"
ADD COLUMN "storageMode" TEXT NOT NULL DEFAULT 'MINIO',
ADD COLUMN "storageEndpoint" TEXT,
ADD COLUMN "storageRegion" TEXT,
ADD COLUMN "storageBucket" TEXT,
ADD COLUMN "storageAccessKeyId" TEXT,
ADD COLUMN "storageSecretAccessKey" TEXT,
ADD COLUMN "storageUsePathStyle" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "storageValidatedAt" TIMESTAMP(3),
ADD COLUMN "storageLastError" TEXT;
