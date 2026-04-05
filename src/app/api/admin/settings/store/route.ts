import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminRequestContext } from "@/lib/admin/request-context";
import { enforceCsrfProtection } from "@/lib/security/csrf";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const updateStoreSettingsSchema = z.object({
  contactEmail: z.email("Enter a valid contact email.").max(320).optional(),
  storeStatus: z.enum(["PRIVATE", "PUBLIC"]).optional(),
  featuredReleaseId: z.string().trim().min(1).max(64).nullable().optional(),
})
  .refine(
    (value) =>
      typeof value.contactEmail === "string" ||
      typeof value.storeStatus === "string" ||
      value.featuredReleaseId !== undefined,
    {
      message: "Provide at least one store setting to update.",
      path: ["contactEmail"],
    },
  );

export async function GET() {
  const auth = await requireAdminRequestContext();
  if (!auth.ok) {
    return auth.response;
  }

  const settings = await prisma.storeSettings.findFirst({
    where: { organizationId: auth.context.organizationId },
    select: { contactEmail: true, storeStatus: true, featuredReleaseId: true },
  });

  return NextResponse.json(
    {
      ok: true,
      data: {
        contactEmail: settings?.contactEmail ?? "",
        storeStatus: settings?.storeStatus ?? "SETUP",
        featuredReleaseId: settings?.featuredReleaseId ?? null,
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const csrfError = enforceCsrfProtection(request);
  if (csrfError) {
    return csrfError;
  }

  const auth = await requireAdminRequestContext();
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const payload = await request.json();
    const parsed = updateStoreSettingsSchema.parse(payload);

    if (typeof parsed.featuredReleaseId === "string") {
      const featuredRelease = await prisma.release.findFirst({
        where: {
          id: parsed.featuredReleaseId,
          organizationId: auth.context.organizationId,
          status: "PUBLISHED",
          deletedAt: null,
        },
        select: { id: true },
      });

      if (!featuredRelease) {
        return NextResponse.json(
          {
            ok: false,
            error: "Featured release must be an active published release.",
          },
          { status: 400 },
        );
      }
    }

    const updateResult = await prisma.storeSettings.updateMany({
      where: { organizationId: auth.context.organizationId },
      data: {
        ...(typeof parsed.contactEmail === "string" ? { contactEmail: parsed.contactEmail } : {}),
        ...(typeof parsed.storeStatus === "string" ? { storeStatus: parsed.storeStatus } : {}),
        ...(parsed.featuredReleaseId !== undefined
          ? { featuredReleaseId: parsed.featuredReleaseId }
          : {}),
      },
    });

    if (updateResult.count === 0) {
      return NextResponse.json(
        { ok: false, error: "Store settings could not be found." },
        { status: 404 },
      );
    }

    const settings = await prisma.storeSettings.findFirst({
      where: { organizationId: auth.context.organizationId },
      select: { contactEmail: true, storeStatus: true, featuredReleaseId: true },
    });

    return NextResponse.json({
      ok: true,
      data: {
        contactEmail: settings?.contactEmail ?? "",
        storeStatus: settings?.storeStatus ?? "SETUP",
        featuredReleaseId: settings?.featuredReleaseId ?? null,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: "Invalid store settings.", issues: error.issues },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { ok: false, error: "Failed to save store settings." },
      { status: 500 },
    );
  }
}
