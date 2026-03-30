ALTER TABLE "SetupWizardState"
ALTER COLUMN "storageMode" SET DEFAULT 'GARAGE';

UPDATE "SetupWizardState"
SET "storageMode" = 'GARAGE'
WHERE "storageMode" = 'MINIO';
