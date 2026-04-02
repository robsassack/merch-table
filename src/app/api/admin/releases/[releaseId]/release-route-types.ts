import type { Prisma } from "@/generated/prisma/client";
import { z } from "zod";

import {
  adminReleaseLegacyNoDeliveryFormatsSelect,
  adminReleaseLegacySelect,
  adminReleaseNoDeliveryFormatsSelect,
  adminReleaseSelect,
} from "@/lib/admin/release-management";

export const updateReleaseSchema = z.object({
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

export const softDeleteSchema = z.object({
  action: z.literal("soft-delete"),
});

export const restoreSchema = z.object({
  action: z.literal("restore"),
});

export const generateDownloadFormatsSchema = z.object({
  action: z.literal("generate-download-formats"),
});

export const forceRequeueTranscodesSchema = z.object({
  action: z.literal("force-requeue-transcodes"),
});

export const requeueFailedTranscodesSchema = z.object({
  action: z.literal("requeue-failed-transcodes"),
});

export const purgeSchema = z.object({
  action: z.literal("purge"),
  confirmTitle: z.string(),
});

export const hardDeleteSchema = z.object({
  action: z.literal("hard-delete"),
  confirmTitle: z.string(),
});

export const releaseActionSchema = z.discriminatedUnion("action", [
  updateReleaseSchema,
  softDeleteSchema,
  restoreSchema,
  generateDownloadFormatsSchema,
  requeueFailedTranscodesSchema,
  forceRequeueTranscodesSchema,
  purgeSchema,
  hardDeleteSchema,
]);

export type ReleaseAction = z.infer<typeof releaseActionSchema>;

export type UpdateReleaseAction = Extract<ReleaseAction, { action: "update" }>;
export type SoftDeleteReleaseAction = Extract<ReleaseAction, { action: "soft-delete" }>;
export type RestoreReleaseAction = Extract<ReleaseAction, { action: "restore" }>;
export type GenerateDownloadFormatsAction = Extract<
  ReleaseAction,
  { action: "generate-download-formats" }
>;
export type ForceRequeueTranscodesAction = Extract<
  ReleaseAction,
  { action: "force-requeue-transcodes" }
>;
export type RequeueFailedTranscodesAction = Extract<
  ReleaseAction,
  { action: "requeue-failed-transcodes" }
>;
export type PurgeReleaseAction = Extract<ReleaseAction, { action: "purge" }>;
export type HardDeleteReleaseAction = Extract<ReleaseAction, { action: "hard-delete" }>;

export type ReleaseTrackAssetState = {
  id: string;
  assetRole: string;
  isLossless: boolean;
  storageKey: string;
  updatedAt: Date;
};

export type ReleaseTrackTranscodeJobState = {
  sourceAssetId: string;
  jobKind: "PREVIEW_CLIP" | "DELIVERY_FORMATS";
  status: string;
};

export type ReleaseTrackState = {
  id: string;
  previewMode: string;
  assets: ReleaseTrackAssetState[];
  transcodeJobs: ReleaseTrackTranscodeJobState[];
};

export type ReleaseForActionState = {
  id: string;
  artistId: string;
  title: string;
  coverImageUrl: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  deletedAt: Date | null;
  files: Array<{ id: string; storageKey: string }>;
  tracks: ReleaseTrackState[];
  _count: { orderItems: number };
  releaseDate?: Date | null;
  deliveryFormats?: Array<"MP3" | "M4A" | "FLAC">;
};

export function resolveReleaseSelect(input: {
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

export function resolveReleaseForActionSelect(input: {
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
        previewMode: true,
        assets: {
          select: {
            id: true,
            assetRole: true,
            isLossless: true,
            storageKey: true,
            updatedAt: true,
          },
        },
        transcodeJobs: {
          select: {
            sourceAssetId: true,
            jobKind: true,
            status: true,
          },
        },
      },
    },
  } satisfies Prisma.ReleaseSelect;
}
