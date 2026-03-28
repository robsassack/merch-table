ALTER TABLE "SetupWizardState"
ADD COLUMN "stripeSecretKey" TEXT,
ADD COLUMN "stripeWebhookSecret" TEXT,
ADD COLUMN "stripeVerifiedAt" TIMESTAMP(3),
ADD COLUMN "stripeLastError" TEXT;
