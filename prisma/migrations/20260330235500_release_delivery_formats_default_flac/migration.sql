-- AlterTable
ALTER TABLE "Release"
ALTER COLUMN "deliveryFormats"
SET DEFAULT ARRAY['MP3', 'M4A', 'FLAC']::"DeliveryFormat"[];
