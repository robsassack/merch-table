-- CreateEnum
CREATE TYPE "DeliveryFormat" AS ENUM ('MP3', 'M4A');

-- AlterTable
ALTER TABLE "Release"
ADD COLUMN "deliveryFormats" "DeliveryFormat"[] NOT NULL DEFAULT ARRAY['MP3', 'M4A']::"DeliveryFormat"[];
