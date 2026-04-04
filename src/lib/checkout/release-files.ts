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

function formatDeliveryFileName(
  trackNumber: number,
  artistName: string | null,
  title: string,
  extension: string,
) {
  const paddedTrackNumber = String(trackNumber).padStart(2, "0");
  if (artistName && artistName.trim().length > 0) {
    return `${paddedTrackNumber} - ${artistName.trim()} - ${title}.${extension}`;
  }

  return `${paddedTrackNumber} - ${title}.${extension}`;
}

type CurrentReleaseSourceAsset = {
  trackId: string;
  storageKey: string;
  mimeType: string;
  fileSizeBytes: number;
  format: string;
  track: {
    title: string;
    artistOverride: string | null;
    trackNumber: number;
  };
};

type TrackAssetReader = Pick<Prisma.TransactionClient, "trackAsset">;

function dedupeLatestAssetsByTrackAndFormat(assets: CurrentReleaseSourceAsset[]) {
  const deduped = new Map<string, CurrentReleaseSourceAsset>();
  for (const asset of assets) {
    const dedupeKey = `${asset.trackId}:${asset.format.toLowerCase()}`;
    if (!deduped.has(dedupeKey)) {
      deduped.set(dedupeKey, asset);
    }
  }

  return Array.from(deduped.values()).sort((a, b) => {
    if (a.track.trackNumber !== b.track.trackNumber) {
      return a.track.trackNumber - b.track.trackNumber;
    }

    return a.format.localeCompare(b.format);
  });
}

export async function resolveCurrentReleaseSourceAssets(input: {
  db: TrackAssetReader;
  releaseId: string;
  organizationId: string;
  includeDeletedRelease?: boolean;
}) {
  const releaseFilter =
    input.includeDeletedRelease === true
      ? {
          organizationId: input.organizationId,
        }
      : {
          organizationId: input.organizationId,
          deletedAt: null,
        };

  const deliveryAssets = (await input.db.trackAsset.findMany({
    where: {
      assetRole: "DELIVERY",
      track: {
        releaseId: input.releaseId,
        release: releaseFilter,
      },
    },
    orderBy: [{ createdAt: "desc" }],
    select: {
      trackId: true,
      storageKey: true,
      mimeType: true,
      fileSizeBytes: true,
      format: true,
      track: {
        select: {
          title: true,
          artistOverride: true,
          trackNumber: true,
        },
      },
    },
  })) as CurrentReleaseSourceAsset[];

  const lossyMasterAssets = (await input.db.trackAsset.findMany({
    where: {
      assetRole: "MASTER",
      isLossless: false,
      track: {
        releaseId: input.releaseId,
        release: {
          ...releaseFilter,
        },
      },
    },
    orderBy: [{ createdAt: "desc" }],
    select: {
      trackId: true,
      storageKey: true,
      mimeType: true,
      fileSizeBytes: true,
      format: true,
      track: {
        select: {
          title: true,
          artistOverride: true,
          trackNumber: true,
        },
      },
    },
  })) as CurrentReleaseSourceAsset[];

  if (deliveryAssets.length === 0) {
    return dedupeLatestAssetsByTrackAndFormat(lossyMasterAssets);
  }

  // Keep explicit DELIVERY assets as the primary source, but fill gaps for
  // newly uploaded master-only tracks so buyers can still download them.
  const trackIdsWithDelivery = new Set(deliveryAssets.map((asset) => asset.trackId));
  const lossyMasterFallbackAssets = lossyMasterAssets.filter(
    (asset) => !trackIdsWithDelivery.has(asset.trackId),
  );

  if (lossyMasterFallbackAssets.length === 0) {
    return dedupeLatestAssetsByTrackAndFormat(deliveryAssets);
  }

  return dedupeLatestAssetsByTrackAndFormat([
    ...deliveryAssets,
    ...lossyMasterFallbackAssets,
  ]);
}

export async function ensureReleaseFilesForCheckout(
  tx: Pick<Prisma.TransactionClient, "trackAsset" | "releaseFile">,
  input: {
    releaseId: string;
    organizationId: string;
  },
) {
  const sourceAssets = await resolveCurrentReleaseSourceAssets({
    db: tx,
    releaseId: input.releaseId,
    organizationId: input.organizationId,
  });

  if (sourceAssets.length === 0) {
    return [];
  }

  const desiredReleaseFiles = sourceAssets.map((asset, index) => {
    const extension = inferExtensionFromMimeType(asset.mimeType, asset.format);
    const resolvedTrackArtistName = asset.track.artistOverride?.trim() || null;

    return {
      releaseId: input.releaseId,
      fileName: formatDeliveryFileName(
        asset.track.trackNumber,
        resolvedTrackArtistName,
        asset.track.title,
        extension,
      ),
      storageKey: asset.storageKey,
      mimeType: asset.mimeType,
      sizeBytes: asset.fileSizeBytes,
      sortOrder: index,
    };
  });

  await tx.releaseFile.createMany({
    data: desiredReleaseFiles,
    skipDuplicates: true,
  });

  // Keep existing release-file metadata in sync with current track/release details.
  for (const desiredFile of desiredReleaseFiles) {
    await tx.releaseFile.updateMany({
      where: {
        releaseId: input.releaseId,
        storageKey: desiredFile.storageKey,
      },
      data: {
        fileName: desiredFile.fileName,
        mimeType: desiredFile.mimeType,
        sizeBytes: desiredFile.sizeBytes,
        sortOrder: desiredFile.sortOrder,
      },
    });
  }

  return tx.releaseFile.findMany({
    where: {
      releaseId: input.releaseId,
      storageKey: {
        in: sourceAssets.map((asset) => asset.storageKey),
      },
      release: {
        organizationId: input.organizationId,
        deletedAt: null,
      },
    },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
}
