import type { Prisma } from "@/generated/prisma/client";

function inferExtensionFromMimeType(mimeType: string, fallbackFormat: string) {
  const normalized = mimeType.toLowerCase();
  if (normalized === "audio/mpeg") {
    return "mp3";
  }
  if (normalized === "audio/flac") {
    return "flac";
  }
  if (normalized === "audio/mp4" || normalized === "audio/x-m4a") {
    return "m4a";
  }

  return fallbackFormat.toLowerCase();
}

function formatDeliveryFileName(trackNumber: number, title: string, extension: string) {
  const paddedTrackNumber = String(trackNumber).padStart(2, "0");
  return `${paddedTrackNumber} - ${title}.${extension}`;
}

export async function ensureReleaseFilesForCheckout(
  tx: Prisma.TransactionClient,
  input: {
    releaseId: string;
    organizationId: string;
  },
) {
  const existingFiles = await tx.releaseFile.findMany({
    where: {
      releaseId: input.releaseId,
      release: {
        organizationId: input.organizationId,
        deletedAt: null,
      },
    },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });

  if (existingFiles.length > 0) {
    return existingFiles;
  }

  const deliveryAssets = await tx.trackAsset.findMany({
    where: {
      assetRole: "DELIVERY",
      track: {
        releaseId: input.releaseId,
        release: {
          organizationId: input.organizationId,
          deletedAt: null,
        },
      },
    },
    orderBy: [{ track: { trackNumber: "asc" } }, { createdAt: "asc" }],
    select: {
      storageKey: true,
      mimeType: true,
      fileSizeBytes: true,
      format: true,
      track: {
        select: {
          title: true,
          trackNumber: true,
        },
      },
    },
  });

  if (deliveryAssets.length === 0) {
    return [];
  }

  await tx.releaseFile.createMany({
    data: deliveryAssets.map((asset, index) => {
      const extension = inferExtensionFromMimeType(asset.mimeType, asset.format);

      return {
        releaseId: input.releaseId,
        fileName: formatDeliveryFileName(
          asset.track.trackNumber,
          asset.track.title,
          extension,
        ),
        storageKey: asset.storageKey,
        mimeType: asset.mimeType,
        sizeBytes: asset.fileSizeBytes,
        sortOrder: index,
      };
    }),
    skipDuplicates: true,
  });

  return tx.releaseFile.findMany({
    where: {
      releaseId: input.releaseId,
      release: {
        organizationId: input.organizationId,
        deletedAt: null,
      },
    },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
}
