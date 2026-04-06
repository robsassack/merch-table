-- CreateEnum
CREATE TYPE "ReleaseType" AS ENUM (
  'ALBUM',
  'EP',
  'SINGLE',
  'COMPILATION',
  'MIXTAPE',
  'LIVE_ALBUM',
  'SOUNDTRACK_SCORE',
  'DEMO',
  'BOOTLEG',
  'REMIX',
  'OTHER'
);

-- AlterTable
ALTER TABLE "Release"
ADD COLUMN "releaseType" "ReleaseType" NOT NULL DEFAULT 'ALBUM';
