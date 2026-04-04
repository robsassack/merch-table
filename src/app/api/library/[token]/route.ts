import { NextResponse } from "next/server";

import { resolveReleaseFileFormat } from "@/lib/checkout/download-format";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ token: string }>;
};

function isExpired(expiresAt: Date | null, now: Date) {
  return Boolean(expiresAt && expiresAt.getTime() <= now.getTime());
}

export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "Library token is required." },
      { status: 400 },
    );
  }

  const now = new Date();
  const libraryToken = await prisma.buyerLibraryToken.findUnique({
    where: { token },
    select: {
      id: true,
      customerId: true,
      revokedAt: true,
      expiresAt: true,
    },
  });

  if (!libraryToken) {
    return NextResponse.json(
      { ok: false, error: "Library token not found." },
      { status: 404 },
    );
  }

  if (libraryToken.revokedAt) {
    return NextResponse.json(
      { ok: false, error: "Library token has been revoked." },
      { status: 403 },
    );
  }

  if (isExpired(libraryToken.expiresAt, now)) {
    return NextResponse.json(
      { ok: false, error: "Library token has expired." },
      { status: 403 },
    );
  }

  const updatedToken = await prisma.buyerLibraryToken.update({
    where: { id: libraryToken.id },
    data: {
      lastUsedAt: now,
      accessCount: { increment: 1 },
    },
    select: {
      lastUsedAt: true,
      accessCount: true,
      expiresAt: true,
    },
  });

  const entitlements = await prisma.downloadEntitlement.findMany({
    where: {
      customerId: libraryToken.customerId,
    },
    orderBy: [{ createdAt: "desc" }],
    select: {
      token: true,
      createdAt: true,
      releaseFileId: true,
      releaseFile: {
        select: {
          id: true,
          fileName: true,
          sizeBytes: true,
          mimeType: true,
        },
      },
      release: {
        select: {
          id: true,
          title: true,
          slug: true,
          coverImageUrl: true,
          artist: {
            select: {
              name: true,
            },
          },
        },
      },
      orderItem: {
        select: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              paidAt: true,
              createdAt: true,
            },
          },
        },
      },
    },
  });

  const availableDownloadFormatsByReleaseId: Record<string, Array<"mp3" | "m4a" | "flac">> =
    {};
  for (const entitlement of entitlements) {
    const releaseId = entitlement.release.id;
    const format = resolveReleaseFileFormat({
      fileName: entitlement.releaseFile.fileName,
      mimeType: entitlement.releaseFile.mimeType,
    });
    if (!format) {
      continue;
    }

    const existing = availableDownloadFormatsByReleaseId[releaseId] ?? [];
    if (!existing.includes(format)) {
      availableDownloadFormatsByReleaseId[releaseId] = [...existing, format];
    }
  }

  return NextResponse.json(
    {
      ok: true,
      libraryToken: {
        expiresAt: updatedToken.expiresAt,
        lastUsedAt: updatedToken.lastUsedAt,
        accessCount: updatedToken.accessCount,
      },
      availableDownloadFormatsByReleaseId,
      downloads: entitlements.map((entitlement) => ({
        entitlementToken: entitlement.token,
        releaseFileId: entitlement.releaseFileId,
        downloadPath: `/api/download/${encodeURIComponent(entitlement.token)}/${encodeURIComponent(entitlement.releaseFileId)}`,
        fileName: entitlement.releaseFile.fileName,
        mimeType: entitlement.releaseFile.mimeType,
        sizeBytes: entitlement.releaseFile.sizeBytes,
        format: resolveReleaseFileFormat({
          fileName: entitlement.releaseFile.fileName,
          mimeType: entitlement.releaseFile.mimeType,
        }),
        release: {
          id: entitlement.release.id,
          title: entitlement.release.title,
          slug: entitlement.release.slug,
          coverImageUrl: entitlement.release.coverImageUrl,
          artistName: entitlement.release.artist.name,
        },
        order: {
          id: entitlement.orderItem.order.id,
          orderNumber: entitlement.orderItem.order.orderNumber,
          purchasedAt:
            entitlement.orderItem.order.paidAt ??
            entitlement.orderItem.order.createdAt,
        },
        grantedAt: entitlement.createdAt,
      })),
    },
    {
      headers: {
        "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    },
  );
}
