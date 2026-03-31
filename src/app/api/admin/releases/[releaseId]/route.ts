import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import type { Prisma } from "@/generated/prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  adminReleaseLegacyNoDeliveryFormatsSelect,
  adminReleaseLegacySelect,
  adminReleaseNoDeliveryFormatsSelect,
  adminReleaseSelect,
  normalizeNullableText,
  prismaReleaseSupportsField,
  slugify,
  toAdminReleaseRecord,
} from "@/lib/admin/release-management";
import {
  normalizePricingForRelease,
  readMinimumPriceFloorCentsFromEnv,
} from "@/lib/pricing/pricing-rules";
import { prisma } from "@/lib/prisma";
import { enforceCsrfProtection } from "@/lib/security/csrf";
import { getStorageAdapterFromEnv } from "@/lib/storage/adapter";
import { requireAdminRequestContext } from "@/lib/admin/request-context";
import { enqueueDeliveryFormatsJob } from "@/lib/transcode/queue";
import {
  extractStorageKeyFromCoverImageUrl,
  isValidCoverStorageKey,
  resolveCoverImageUrlFromStorageKey,
} from "@/lib/storage/cover-art";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ releaseId: string }>;
};

const updateReleaseSchema = z.object({
  action: z.literal("update"),
  artistId: z.string().trim().min(1),
  title: z.string().trim().min(1).max(160),
  slug: z.string().trim().max(160).optional(),
  description: z.string().max(4_000).nullable().optional(),
  releaseDate: z.string().trim().optional(),
  coverStorageKey: z.string().trim().max(500).nullable().optional(),
  removeCoverImage: z.boolean().optional(),
  pricingMode: z.enum(["FREE", "FIXED", "PWYW"]),
  fixedPriceCents: z.number().int().nullable().optional(),
  minimumPriceCents: z.number().int().nullable().optional(),
  deliveryFormats: z.array(z.enum(["MP3", "M4A", "FLAC"])).min(1).optional(),
  allowFreeCheckout: z.boolean().optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
  markLossyOnly: z.boolean(),
  confirmLossyOnly: z.boolean().optional(),
});

const softDeleteSchema = z.object({
  action: z.literal("soft-delete"),
});

const restoreSchema = z.object({
  action: z.literal("restore"),
});

const generateDownloadFormatsSchema = z.object({
  action: z.literal("generate-download-formats"),
});

const purgeSchema = z.object({
  action: z.literal("purge"),
  confirmTitle: z.string(),
});

const hardDeleteSchema = z.object({
  action: z.literal("hard-delete"),
  confirmTitle: z.string(),
});

const actionSchema = z.discriminatedUnion("action", [
  updateReleaseSchema,
  softDeleteSchema,
  restoreSchema,
  generateDownloadFormatsSchema,
  purgeSchema,
  hardDeleteSchema,
]);

function resolveReleaseSelect(input: {
  releaseDateSupported: boolean;
  deliveryFormatsSupported: boolean;
}) {
  if (input.releaseDateSupported && input.deliveryFormatsSupported) {
    return adminReleaseSelect;
  }

  if (input.releaseDateSupported) {
    return adminReleaseNoDeliveryFormatsSelect;
  }

  if (input.deliveryFormatsSupported) {
    return adminReleaseLegacySelect;
  }

  return adminReleaseLegacyNoDeliveryFormatsSelect;
}

function resolveReleaseForActionSelect(input: {
  releaseDateSupported: boolean;
  deliveryFormatsSupported: boolean;
}) {
  const baseSelect = resolveReleaseSelect(input);
  return {
    ...baseSelect,
    files: {
      select: {
        id: true,
        storageKey: true,
      },
    },
    tracks: {
      select: {
        id: true,
        assets: {
          select: {
            id: true,
            assetRole: true,
            isLossless: true,
            storageKey: true,
          },
        },
      },
    },
  } satisfies Prisma.ReleaseSelect;
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

function isForeignKeyConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2003"
  );
}

function getStorageHttpStatusCode(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "$metadata" in error &&
    typeof error.$metadata === "object" &&
    error.$metadata !== null &&
    "httpStatusCode" in error.$metadata &&
    typeof error.$metadata.httpStatusCode === "number"
  ) {
    return error.$metadata.httpStatusCode;
  }

  return null;
}

function isMissingStorageObjectError(error: unknown) {
  const statusCode = getStorageHttpStatusCode(error);
  if (statusCode === 404) {
    return true;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    typeof error.name === "string"
  ) {
    return error.name === "NoSuchKey" || error.name === "NotFound";
  }

  return false;
}

function parseDateInputValue(dateInput: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    return null;
  }

  const [yearText, monthText, dayText] = dateInput.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }

  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed;
}

async function purgeStorageObjects(storageKeys: string[]) {
  const uniqueKeys = Array.from(
    new Set(storageKeys.map((key) => key.trim()).filter((key) => key.length > 0)),
  );
  if (uniqueKeys.length === 0) {
    return 0;
  }

  const storage = getStorageAdapterFromEnv();
  const client = storage.getClient();

  const failedKeys: string[] = [];
  for (const key of uniqueKeys) {
    try {
      await client.send(
        new DeleteObjectCommand({
          Bucket: storage.bucket,
          Key: key,
        }),
      );
    } catch (error) {
      if (isMissingStorageObjectError(error)) {
        continue;
      }

      failedKeys.push(key);
    }
  }

  if (failedKeys.length > 0) {
    throw new Error(
      `Could not delete ${failedKeys.length} storage asset${failedKeys.length === 1 ? "" : "s"}.`,
    );
  }

  return uniqueKeys.length;
}

export async function PATCH(request: Request, context: RouteContext) {
  const csrfError = enforceCsrfProtection(request);
  if (csrfError) {
    return csrfError;
  }

  const auth = await requireAdminRequestContext();
  if (!auth.ok) {
    return auth.response;
  }

  const { releaseId } = await context.params;
  if (!releaseId) {
    return NextResponse.json(
      { ok: false, error: "Release id is required." },
      { status: 400 },
    );
  }

  const minimumPriceFloorCents = readMinimumPriceFloorCentsFromEnv();
  const releaseDateSupported = prismaReleaseSupportsField(prisma, "releaseDate");
  const deliveryFormatsSupported = prismaReleaseSupportsField(prisma, "deliveryFormats");
  const releaseSelect = resolveReleaseSelect({
    releaseDateSupported,
    deliveryFormatsSupported,
  });
  const releaseForActionSelect = resolveReleaseForActionSelect({
    releaseDateSupported,
    deliveryFormatsSupported,
  });

  try {
    const payload = await request.json();
    const parsed = actionSchema.parse(payload);

    const release = await prisma.release.findFirst({
      where: {
        id: releaseId,
        organizationId: auth.context.organizationId,
      },
      select: releaseForActionSelect,
    });

    if (!release) {
      return NextResponse.json(
        { ok: false, error: "Release not found." },
        { status: 404 },
      );
    }

    if (parsed.action === "update") {
      const artist = await prisma.artist.findFirst({
        where: {
          id: parsed.artistId,
          organizationId: auth.context.organizationId,
        },
        select: {
          id: true,
          deletedAt: true,
        },
      });

      if (!artist) {
        return NextResponse.json(
          { ok: false, error: "Select an artist for this release." },
          { status: 400 },
        );
      }

      const artistIsAllowed =
        !artist.deletedAt || (artist.deletedAt !== null && artist.id === release.artistId);

      if (!artistIsAllowed) {
        return NextResponse.json(
          { ok: false, error: "Cannot move a release to a deleted artist." },
          { status: 409 },
        );
      }

      if (parsed.markLossyOnly && !release.isLossyOnly && !parsed.confirmLossyOnly) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Confirm lossy-only quality disclosure before saving this release.",
          },
          { status: 400 },
        );
      }

      const normalizedPricing = normalizePricingForRelease({
        pricingMode: parsed.pricingMode,
        fixedPriceCents: parsed.fixedPriceCents,
        minimumPriceCents: parsed.minimumPriceCents,
        allowFreeCheckout: parsed.allowFreeCheckout ?? false,
        floorCents: minimumPriceFloorCents,
      });

      if (!normalizedPricing.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: normalizedPricing.error,
          },
          { status: 400 },
        );
      }

      let releaseDate: Date | null = null;
      if (releaseDateSupported) {
        const currentReleaseDate =
          "releaseDate" in release &&
          release.releaseDate &&
          release.releaseDate instanceof Date
            ? release.releaseDate
            : release.createdAt;
        const resolvedReleaseDateInput =
          parsed.releaseDate && parsed.releaseDate.length > 0
            ? parsed.releaseDate
            : currentReleaseDate.toISOString().slice(0, 10);
        releaseDate = parseDateInputValue(resolvedReleaseDateInput);
        if (!releaseDate) {
          return NextResponse.json(
            { ok: false, error: "Provide a valid release date (YYYY-MM-DD)." },
            { status: 400 },
          );
        }
      }

      const resolvedSlug = slugify(
        parsed.slug && parsed.slug.length > 0 ? parsed.slug : parsed.title,
        "release",
      );

      const slugConflict = await prisma.release.findFirst({
        where: {
          organizationId: auth.context.organizationId,
          slug: resolvedSlug,
          id: { not: release.id },
        },
        select: { id: true },
      });

      if (slugConflict) {
        return NextResponse.json(
          { ok: false, error: "That release URL is already in use." },
          { status: 409 },
        );
      }

      const publishedAt =
        parsed.status === "PUBLISHED"
          ? release.publishedAt ?? new Date()
          : null;

      let coverImageUrl = release.coverImageUrl;
      const previousCoverStorageKey = extractStorageKeyFromCoverImageUrl(
        release.coverImageUrl,
      );
      let coverStorageKeyToDelete: string | null = null;

      if (parsed.removeCoverImage) {
        coverImageUrl = null;
        coverStorageKeyToDelete = previousCoverStorageKey;
      }

      if (typeof parsed.coverStorageKey === "string" && parsed.coverStorageKey.length > 0) {
        if (!isValidCoverStorageKey(parsed.coverStorageKey)) {
          return NextResponse.json(
            { ok: false, error: "Invalid cover artwork upload key." },
            { status: 400 },
          );
        }

        coverImageUrl = resolveCoverImageUrlFromStorageKey(parsed.coverStorageKey);
        if (previousCoverStorageKey && previousCoverStorageKey !== parsed.coverStorageKey) {
          coverStorageKeyToDelete = previousCoverStorageKey;
        }
      }

      const updated = await prisma.release.update({
        where: {
          id: release.id,
        },
        // Keep updates compatible with older generated clients that do not include
        // release.deliveryFormats yet.
        data: {
          artistId: artist.id,
          title: parsed.title.trim(),
          slug: resolvedSlug,
          description: normalizeNullableText(parsed.description),
          coverImageUrl,
          pricingMode: parsed.pricingMode,
          fixedPriceCents: normalizedPricing.value.fixedPriceCents,
          minimumPriceCents: normalizedPricing.value.minimumPriceCents,
          ...(deliveryFormatsSupported
            ? {
                deliveryFormats:
                  parsed.deliveryFormats ??
                  ("deliveryFormats" in release &&
                  Array.isArray((release as { deliveryFormats?: unknown }).deliveryFormats)
                    ? (release as { deliveryFormats: Array<"MP3" | "M4A" | "FLAC"> })
                        .deliveryFormats
                    : ["MP3", "M4A", "FLAC"]),
              }
            : {}),
          priceCents: normalizedPricing.value.priceCents,
          status: parsed.status,
          ...(releaseDateSupported && releaseDate ? { releaseDate } : {}),
          publishedAt,
          isLossyOnly: parsed.markLossyOnly,
        },
        select: releaseSelect,
      });

      if (coverStorageKeyToDelete) {
        await purgeStorageObjects([coverStorageKeyToDelete]).catch(() => undefined);
      }

      return NextResponse.json({ ok: true, release: toAdminReleaseRecord(updated) });
    }

    if (parsed.action === "soft-delete") {
      const updated = await prisma.release.update({
        where: {
          id: release.id,
        },
        data: {
          deletedAt: release.deletedAt ? release.deletedAt : new Date(),
        },
        select: releaseSelect,
      });

      return NextResponse.json({ ok: true, release: toAdminReleaseRecord(updated) });
    }

    if (parsed.action === "restore") {
      const updated = await prisma.release.update({
        where: {
          id: release.id,
        },
        data: {
          deletedAt: null,
        },
        select: releaseSelect,
      });

      return NextResponse.json({ ok: true, release: toAdminReleaseRecord(updated) });
    }

    if (parsed.action === "generate-download-formats") {
      if (
        deliveryFormatsSupported &&
        "deliveryFormats" in release &&
        Array.isArray((release as { deliveryFormats?: unknown }).deliveryFormats) &&
        (release as { deliveryFormats: unknown[] }).deliveryFormats.length === 0
      ) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "No delivery formats are enabled for this release. Select at least one format and save first.",
          },
          { status: 409 },
        );
      }

      const losslessMasters = release.tracks
        .map((track) => {
          const sourceAsset = track.assets.find(
            (asset) => asset.assetRole === "MASTER" && asset.isLossless,
          );

          if (!sourceAsset) {
            return null;
          }

          return {
            trackId: track.id,
            sourceAssetId: sourceAsset.id,
          };
        })
        .filter(
          (
            entry,
          ): entry is {
            trackId: string;
            sourceAssetId: string;
          } => entry !== null,
        );

      if (losslessMasters.length === 0) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "No lossless master assets were found on this release. Upload at least one lossless master first.",
          },
          { status: 409 },
        );
      }

      const enqueueSummary = await prisma.$transaction(async (tx) => {
        const queuedJobIds: string[] = [];
        let alreadyQueuedJobs = 0;

        for (const candidate of losslessMasters) {
          const pendingJob = await tx.transcodeJob.findFirst({
            where: {
              organizationId: auth.context.organizationId,
              trackId: candidate.trackId,
              sourceAssetId: candidate.sourceAssetId,
              status: {
                in: ["QUEUED", "RUNNING"],
              },
            },
            select: {
              id: true,
            },
          });

          if (pendingJob) {
            alreadyQueuedJobs += 1;
            continue;
          }

          const queuedJob = await tx.transcodeJob.create({
            data: {
              organizationId: auth.context.organizationId,
              trackId: candidate.trackId,
              sourceAssetId: candidate.sourceAssetId,
              status: "QUEUED",
            },
            select: {
              id: true,
            },
          });

          queuedJobIds.push(queuedJob.id);
        }

        return {
          queuedJobIds,
          alreadyQueuedJobs,
        };
      });

      let queuedTranscodeJobs = 0;
      for (const jobId of enqueueSummary.queuedJobIds) {
        try {
          await enqueueDeliveryFormatsJob(jobId);
          queuedTranscodeJobs += 1;
        } catch {
          await prisma.transcodeJob
            .update({
              where: { id: jobId },
              data: {
                status: "FAILED",
                errorMessage: "Could not enqueue delivery transcode job.",
                finishedAt: new Date(),
              },
            })
            .catch(() => undefined);
        }
      }

      const refreshed = await prisma.release.findFirst({
        where: {
          id: release.id,
          organizationId: auth.context.organizationId,
        },
        select: releaseSelect,
      });

      if (!refreshed) {
        return NextResponse.json(
          { ok: false, error: "Release not found after queuing transcode jobs." },
          { status: 404 },
        );
      }

      return NextResponse.json({
        ok: true,
        release: toAdminReleaseRecord(refreshed),
        queuedTranscodeJobs,
        alreadyQueuedJobs: enqueueSummary.alreadyQueuedJobs,
      });
    }

    if (parsed.confirmTitle.trim() !== release.title) {
      return NextResponse.json(
        {
          ok: false,
          error: "Enter the release title exactly to confirm permanent purge.",
        },
        { status: 400 },
      );
    }

    if (!release.deletedAt) {
      return NextResponse.json(
        {
          ok: false,
          error: "Soft-delete the release before permanently purging assets.",
        },
        { status: 409 },
      );
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
        return NextResponse.json(
          {
            ok: false,
            error:
              "Cannot fully delete a release that has orders. Keep it soft-deleted (and optionally purged).",
          },
          { status: 409 },
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

    const refreshed = await prisma.release.findFirst({
      where: {
        id: release.id,
        organizationId: auth.context.organizationId,
      },
      select: releaseSelect,
    });

    if (!refreshed) {
      return NextResponse.json(
        { ok: false, error: "Release not found after purge." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      release: toAdminReleaseRecord(refreshed),
      purgedAssetCount,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: "Invalid release action request." },
        { status: 400 },
      );
    }

    if (isUniqueConstraintError(error)) {
      return NextResponse.json(
        { ok: false, error: "That release URL is already in use." },
        { status: 409 },
      );
    }

    if (isForeignKeyConstraintError(error)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Cannot fully delete a release that has related records (for example orders).",
        },
        { status: 409 },
      );
    }

    if (error instanceof Error) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { ok: false, error: "Could not update release." },
      { status: 500 },
    );
  }
}
