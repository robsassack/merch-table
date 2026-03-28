ALTER TABLE "SetupWizardState"
ADD COLUMN "smtpHost" TEXT,
ADD COLUMN "smtpPort" INTEGER,
ADD COLUMN "smtpUsername" TEXT,
ADD COLUMN "smtpPassword" TEXT,
ADD COLUMN "smtpSecure" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "smtpFromEmail" TEXT,
ADD COLUMN "smtpTestRecipient" TEXT,
ADD COLUMN "smtpTestPassedAt" TIMESTAMP(3),
ADD COLUMN "smtpLastTestError" TEXT;
