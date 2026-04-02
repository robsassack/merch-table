import { z } from "zod";

import { readMinimumPriceFloorCentsFromEnv } from "@/lib/pricing/pricing-rules";
import { prisma } from "@/lib/prisma";
import { prismaReleaseSupportsField } from "@/lib/admin/release-management";

import { handlePurgeOrHardDeleteAction } from "./actions/purge-release";
import {
  handleForceRequeueTranscodesAction,
  handleGenerateDownloadFormatsAction,
  handleRequeueFailedTranscodesAction,
} from "./actions/transcode-release";
import {
  handleRestoreReleaseAction,
  handleSoftDeleteReleaseAction,
  handleUpdateReleaseAction,
} from "./actions/update-release";
import {
  type ReleaseAction,
  type ReleaseForActionState,
  releaseActionSchema,
  resolveReleaseForActionSelect,
  resolveReleaseSelect,
} from "./release-route-types";
import {
  errorResponse,
  isForeignKeyConstraintError,
  isUniqueConstraintError,
} from "./release-route-utils";

export { errorResponse } from "./release-route-utils";

export async function handleReleasePatchAction(input: {
  request: Request;
  releaseId: string;
  organizationId: string;
}) {
  const { request, releaseId, organizationId } = input;
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
    const parsed: ReleaseAction = releaseActionSchema.parse(payload);

    const release = (await prisma.release.findFirst({
      where: {
        id: releaseId,
        organizationId,
      },
      select: releaseForActionSelect,
    })) as ReleaseForActionState | null;

    if (!release) {
      return errorResponse("Release not found.", 404);
    }

    if (parsed.action === "update") {
      return handleUpdateReleaseAction({
        parsed,
        release,
        organizationId,
        minimumPriceFloorCents,
        releaseDateSupported,
        deliveryFormatsSupported,
        releaseSelect,
      });
    }

    if (parsed.action === "soft-delete") {
      return handleSoftDeleteReleaseAction({
        parsed,
        release,
        releaseSelect,
      });
    }

    if (parsed.action === "restore") {
      return handleRestoreReleaseAction({
        parsed,
        release,
        releaseSelect,
      });
    }

    if (parsed.action === "generate-download-formats") {
      return handleGenerateDownloadFormatsAction({
        parsed,
        release,
        organizationId,
        deliveryFormatsSupported,
        releaseSelect,
      });
    }

    if (parsed.action === "force-requeue-transcodes") {
      return handleForceRequeueTranscodesAction({
        parsed,
        release,
        organizationId,
        releaseSelect,
      });
    }

    if (parsed.action === "requeue-failed-transcodes") {
      return handleRequeueFailedTranscodesAction({
        parsed,
        release,
        organizationId,
        releaseSelect,
      });
    }

    return handlePurgeOrHardDeleteAction({
      parsed,
      release,
      organizationId,
      releaseSelect,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Invalid release action request.", 400);
    }

    if (isUniqueConstraintError(error)) {
      return errorResponse("That release URL is already in use.", 409);
    }

    if (isForeignKeyConstraintError(error)) {
      return errorResponse(
        "Cannot fully delete a release that has related records (for example orders).",
        409,
      );
    }

    if (error instanceof Error) {
      return errorResponse(error.message, 400);
    }

    return errorResponse("Could not update release.", 500);
  }
}
