import type { Prisma } from "@/generated/prisma/client";
import { NextResponse } from "next/server";

import { toAdminReleaseRecord } from "@/lib/admin/release-management";
import { prisma } from "@/lib/prisma";
import { extractStorageKeyFromCoverImageUrl } from "@/lib/storage/cover-art";

import {
  type HardDeleteReleaseAction,
  type PurgeReleaseAction,
  type ReleaseForActionState,
} from "../release-route-types";
import { errorResponse, purgeStorageObjects, refreshReleaseForResponse } from "../release-route-utils";

export async function handlePurgeOrHardDeleteAction<TSelect extends Prisma.ReleaseSelect>(input: {
  parsed: PurgeReleaseAction | HardDeleteReleaseAction;
  release: ReleaseForActionState;
  organizationId: string;
  releaseSelect: TSelect;
}) {
  const { parsed, release, organizationId, releaseSelect } = input;

  if (parsed.confirmTitle.trim() !== release.title) {
    return errorResponse("Enter the release title exactly to confirm permanent purge.", 400);
  }

  if (!release.deletedAt) {
    return errorResponse("Soft-delete the release before permanently purging assets.", 409);
  }

  const storageKeys = [
    ...release.files.map((file) => file.storageKey),
    ...release.tracks.flatMap((track) => track.assets.map((asset) => asset.storageKey)),
  ];
  const coverStorageKey = extractStorageKeyFromCoverImageUrl(release.coverImageUrl);
  if (coverStorageKey) {
    storageKeys.push(coverStorageKey);
  }

  if (parsed.action === "hard-delete") {
    if (release._count.orderItems > 0) {
      return errorResponse(
        "Cannot fully delete a release that has orders. Keep it soft-deleted (and optionally purged).",
        409,
      );
    }

    const purgedAssetCount = await purgeStorageObjects(storageKeys);
    await prisma.release.delete({
      where: {
        id: release.id,
      },
    });

    return NextResponse.json({
      ok: true,
      hardDeletedReleaseId: release.id,
      purgedAssetCount,
    });
  }

  const purgedAssetCount = await purgeStorageObjects(storageKeys);

  await prisma.$transaction([
    prisma.trackAsset.deleteMany({
      where: {
        track: {
          releaseId: release.id,
        },
      },
    }),
    prisma.releaseFile.deleteMany({
      where: {
        releaseId: release.id,
      },
    }),
  ]);

  const refreshedResult = await refreshReleaseForResponse({
    releaseId: release.id,
    organizationId,
    releaseSelect,
    notFoundMessage: "Release not found after purge.",
  });
  if ("response" in refreshedResult) {
    return refreshedResult.response;
  }

  return NextResponse.json({
    ok: true,
    release: toAdminReleaseRecord(
      refreshedResult.release as Parameters<typeof toAdminReleaseRecord>[0],
    ),
    purgedAssetCount,
  });
}
