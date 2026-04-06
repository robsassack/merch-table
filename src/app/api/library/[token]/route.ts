import crypto from "node:crypto";

import { NextResponse } from "next/server";

import {
  createOwnedReleaseHintCookieValue,
  OWNED_RELEASE_HINT_COOKIE_NAME,
  OWNED_RELEASE_HINT_COOKIE_TTL_SECONDS,
} from "@/lib/checkout/owned-release-hint-cookie";
import { ensureReleaseFilesForCheckout } from "@/lib/checkout/release-files";
import { resolveReleaseFileFormat } from "@/lib/checkout/download-format";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ token: string }>;
};

function isExpired(expiresAt: Date | null, now: Date) {
  return Boolean(expiresAt && expiresAt.getTime() <= now.getTime());
}

function createToken() {
  return crypto.randomBytes(32).toString("base64url");
}

async function fetchLibraryEntitlements(customerId: string) {
  return prisma.downloadEntitlement.findMany({
    where: {
      customerId,
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
}

async function syncMissingReleaseFileEntitlements(input: {
  customerId: string;
  existingEntitlements: Array<{ releaseId: string; releaseFileId: string }>;
}) {
  const ownedReleaseOrderItems = await prisma.orderItem.findMany({
    where: {
      order: {
        customerId: input.customerId,
        status: {
          in: ["PAID", "FULFILLED"],
        },
      },
    },
    orderBy: [{ createdAt: "asc" }],
    select: {
      id: true,
      releaseId: true,
      release: {
        select: {
          organizationId: true,
        },
      },
    },
  });
  if (ownedReleaseOrderItems.length === 0) {
    return false;
  }

  const orderItemByReleaseId = new Map<
    string,
    { orderItemId: string; organizationId: string }
  >();
  for (const orderItem of ownedReleaseOrderItems) {
    if (!orderItemByReleaseId.has(orderItem.releaseId)) {
      orderItemByReleaseId.set(orderItem.releaseId, {
        orderItemId: orderItem.id,
        organizationId: orderItem.release.organizationId,
      });
    }
  }

  await Promise.all(
    Array.from(orderItemByReleaseId.entries()).map(([releaseId, value]) =>
      ensureReleaseFilesForCheckout(prisma, {
        releaseId,
        organizationId: value.organizationId,
      }),
    ),
  );

  const releaseIds = Array.from(orderItemByReleaseId.keys());
  const allReleaseFiles = await prisma.releaseFile.findMany({
    where: {
      releaseId: {
        in: releaseIds,
      },
    },
    select: {
      id: true,
      releaseId: true,
    },
  });
  if (allReleaseFiles.length === 0) {
    return false;
  }

  const existingKeys = new Set(
    input.existingEntitlements.map(
      (entitlement) => `${entitlement.releaseId}:${entitlement.releaseFileId}`,
    ),
  );
  const missingEntitlements = allReleaseFiles.filter(
    (releaseFile) => !existingKeys.has(`${releaseFile.releaseId}:${releaseFile.id}`),
  );
  if (missingEntitlements.length === 0) {
    return true;
  }

  await prisma.downloadEntitlement.createMany({
    data: missingEntitlements.map((releaseFile) => ({
      customerId: input.customerId,
      releaseId: releaseFile.releaseId,
      releaseFileId: releaseFile.id,
      orderItemId: orderItemByReleaseId.get(releaseFile.releaseId)!.orderItemId,
      token: createToken(),
    })),
    skipDuplicates: true,
  });

  return true;
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

  let entitlements = await fetchLibraryEntitlements(libraryToken.customerId);

  const addedMissingEntitlements = await syncMissingReleaseFileEntitlements({
    customerId: libraryToken.customerId,
    existingEntitlements: entitlements.map((entitlement) => ({
      releaseId: entitlement.release.id,
      releaseFileId: entitlement.releaseFileId,
    })),
  });
  if (addedMissingEntitlements) {
    entitlements = await fetchLibraryEntitlements(libraryToken.customerId);
  }

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

  const response = NextResponse.json(
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

  const ownedReleaseHintCookie = createOwnedReleaseHintCookieValue(
    entitlements.map((entitlement) => entitlement.release.id),
  );
  if (ownedReleaseHintCookie) {
    response.cookies.set({
      name: OWNED_RELEASE_HINT_COOKIE_NAME,
      value: ownedReleaseHintCookie,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: OWNED_RELEASE_HINT_COOKIE_TTL_SECONDS,
    });
  }

  return response;
}
