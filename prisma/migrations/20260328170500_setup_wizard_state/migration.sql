CREATE TABLE "SetupWizardState" (
    "id" TEXT NOT NULL,
    "singletonKey" INTEGER NOT NULL DEFAULT 1,
    "orgName" TEXT,
    "storeName" TEXT,
    "contactEmail" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SetupWizardState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SetupWizardState_singletonKey_key" ON "SetupWizardState"("singletonKey");
