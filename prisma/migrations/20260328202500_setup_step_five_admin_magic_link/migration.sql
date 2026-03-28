ALTER TABLE "SetupWizardState"
ADD COLUMN "adminEmail" TEXT,
ADD COLUMN "adminMagicLinkSentAt" TIMESTAMP(3),
ADD COLUMN "adminMagicLinkLastError" TEXT;

CREATE TABLE "AdminMagicLinkToken" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminMagicLinkToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminMagicLinkToken_tokenHash_key" ON "AdminMagicLinkToken"("tokenHash");
CREATE INDEX "AdminMagicLinkToken_email_usedAt_expiresAt_idx" ON "AdminMagicLinkToken"("email", "usedAt", "expiresAt");
