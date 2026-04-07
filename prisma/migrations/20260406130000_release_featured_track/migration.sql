-- AlterTable
ALTER TABLE "Release"
ADD COLUMN "featuredTrackId" TEXT;

-- CreateIndex
CREATE INDEX "Release_featuredTrackId_idx" ON "Release"("featuredTrackId");

-- AddForeignKey
ALTER TABLE "Release"
ADD CONSTRAINT "Release_featuredTrackId_fkey"
FOREIGN KEY ("featuredTrackId") REFERENCES "ReleaseTrack"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
