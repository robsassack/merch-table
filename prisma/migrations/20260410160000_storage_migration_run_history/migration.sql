CREATE TABLE "StorageMigrationRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "initiatedByUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sourceProvider" TEXT NOT NULL,
    "targetProvider" TEXT NOT NULL,
    "runtimeSwitchPending" BOOLEAN NOT NULL DEFAULT false,
    "totalObjects" INTEGER NOT NULL,
    "copiedObjects" INTEGER NOT NULL,
    "message" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorageMigrationRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StorageMigrationRun_organizationId_createdAt_idx" ON "StorageMigrationRun"("organizationId", "createdAt");
CREATE INDEX "StorageMigrationRun_initiatedByUserId_idx" ON "StorageMigrationRun"("initiatedByUserId");

ALTER TABLE "StorageMigrationRun" ADD CONSTRAINT "StorageMigrationRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StorageMigrationRun" ADD CONSTRAINT "StorageMigrationRun_initiatedByUserId_fkey" FOREIGN KEY ("initiatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
