import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminRequestContext } from "@/lib/admin/request-context";
import { enforceCsrfProtection } from "@/lib/security/csrf";
import { prisma } from "@/lib/prisma";
import { SUPPORTED_CURRENCY_CODES } from "@/lib/setup/currencies";
import {
  isValidCoverStorageKey,
  resolveCoverImageUrlFromStorageKey,
} from "@/lib/storage/cover-art";
import { readMinimumPriceFloorCentsFromEnv } from "@/lib/pricing/pricing-rules";

export const runtime = "nodejs";

const updateStoreSettingsSchema = z.object({
  orgName: z.string().trim().min(2, "Organization name is required.").max(120).optional(),
  storeName: z.string().trim().min(2, "Store name is required.").max(120).optional(),
  organizationLogoStorageKey: z.string().trim().min(1).max(500).nullable().optional(),
  contactEmail: z.email("Enter a valid contact email.").max(320).optional(),
  adminEmail: z.email("Enter a valid admin email.").max(320).optional(),
  currency: z.enum(SUPPORTED_CURRENCY_CODES).optional(),
  storeStatus: z.enum(["PRIVATE", "PUBLIC"]).optional(),
  featuredReleaseId: z.string().trim().min(1).max(64).nullable().optional(),
})
  .refine(
    (value) =>
      typeof value.orgName === "string" ||
      typeof value.storeName === "string" ||
      value.organizationLogoStorageKey !== undefined ||
      typeof value.contactEmail === "string" ||
      typeof value.adminEmail === "string" ||
      typeof value.currency === "string" ||
      typeof value.storeStatus === "string" ||
      value.featuredReleaseId !== undefined,
    {
      message: "Provide at least one store setting to update.",
      path: ["orgName"],
    },
  );

const ADMIN_EMAIL_VERIFICATION_WINDOW_MS = 10 * 60 * 1_000;
const DEFAULT_EXCHANGE_RATE_API_BASE_URL = "https://api.frankfurter.app";

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

async function hasRecentAdminAuthVerification(input: {
  sessionToken: string;
}) {
  const session = await prisma.session.findUnique({
    where: { token: input.sessionToken },
    select: { createdAt: true },
  });

  if (!session) {
    return false;
  }

  return Date.now() - session.createdAt.getTime() <= ADMIN_EMAIL_VERIFICATION_WINDOW_MS;
}

function resolveExchangeRateApiBaseUrl() {
  return (
    process.env.EXCHANGE_RATE_API_BASE_URL?.trim() ||
    DEFAULT_EXCHANGE_RATE_API_BASE_URL
  );
}

async function fetchExchangeRate(input: { from: string; to: string }) {
  if (input.from === input.to) {
    return 1;
  }

  const apiBaseUrl = resolveExchangeRateApiBaseUrl().replace(/\/+$/, "");
  const url = `${apiBaseUrl}/latest?from=${encodeURIComponent(input.from)}&to=${encodeURIComponent(input.to)}`;
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    signal: AbortSignal.timeout(6_000),
  });

  if (!response.ok) {
    throw new Error("Currency conversion rates are unavailable.");
  }

  const body = (await response.json().catch(() => null)) as
    | { rates?: Record<string, number> }
    | null;
  const rate = body?.rates?.[input.to];
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
    throw new Error("Currency conversion rate is invalid.");
  }

  return rate;
}

function convertAmountCents(input: { cents: number; rate: number }) {
  return Math.max(0, Math.round(input.cents * input.rate));
}

export async function GET() {
  const auth = await requireAdminRequestContext();
  if (!auth.ok) {
    return auth.response;
  }

  const settings = await prisma.storeSettings.findFirst({
    where: { organizationId: auth.context.organizationId },
    select: {
      storeName: true,
      organizationLogoUrl: true,
      contactEmail: true,
      currency: true,
      storeStatus: true,
      featuredReleaseId: true,
      organization: {
        select: { name: true },
      },
    },
  });

  const adminUser = await prisma.user.findUnique({
    where: { id: auth.context.session.userId },
    select: { email: true },
  });

  return NextResponse.json(
    {
      ok: true,
      data: {
        orgName: settings?.organization?.name ?? "",
        storeName: settings?.storeName ?? "",
        organizationLogoUrl: settings?.organizationLogoUrl ?? null,
        contactEmail: settings?.contactEmail ?? "",
        adminEmail: adminUser?.email ?? auth.context.session.email,
        currency: settings?.currency ?? "USD",
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
    const minimumPriceFloorCents = readMinimumPriceFloorCentsFromEnv();

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

    const normalizedCurrentAdminEmail = auth.context.session.email.trim().toLowerCase();
    const normalizedNextAdminEmail = parsed.adminEmail?.trim().toLowerCase();
    const adminEmailChanged =
      typeof normalizedNextAdminEmail === "string" &&
      normalizedNextAdminEmail !== normalizedCurrentAdminEmail;

    if (adminEmailChanged) {
      const recentlyVerified = await hasRecentAdminAuthVerification({
        sessionToken: auth.context.session.sessionToken,
      });
      if (!recentlyVerified) {
        return NextResponse.json(
          {
            ok: false,
            code: "ADMIN_EMAIL_CHANGE_REQUIRES_VERIFICATION",
            error:
              "For security, verify your admin session before changing admin email. Send a verification link, open it, then retry save.",
          },
          { status: 403 },
        );
      }
    }

    const existingSettings = await prisma.storeSettings.findFirst({
      where: { organizationId: auth.context.organizationId },
      select: { currency: true },
    });

    const shouldConvertReleaseCurrencies =
      typeof parsed.currency === "string" &&
      parsed.currency !== (existingSettings?.currency ?? "USD");

    const exchangeRate = shouldConvertReleaseCurrencies
      ? await fetchExchangeRate({
          from: existingSettings?.currency ?? "USD",
          to: parsed.currency as string,
        })
      : null;

    let nextOrganizationLogoUrl: string | null | undefined = undefined;
    if (parsed.organizationLogoStorageKey !== undefined) {
      if (typeof parsed.organizationLogoStorageKey === "string") {
        if (!isValidCoverStorageKey(parsed.organizationLogoStorageKey)) {
          return NextResponse.json(
            {
              ok: false,
              error: "Invalid organization logo upload key.",
            },
            { status: 400 },
          );
        }

        nextOrganizationLogoUrl = resolveCoverImageUrlFromStorageKey(
          parsed.organizationLogoStorageKey,
        );
      } else {
        nextOrganizationLogoUrl = null;
      }
    }

    const updateResult = await prisma.$transaction(async (tx) => {
      const storeSettingsUpdateResult = await tx.storeSettings.updateMany({
        where: { organizationId: auth.context.organizationId },
        data: {
          ...(typeof parsed.storeName === "string" ? { storeName: parsed.storeName } : {}),
          ...(nextOrganizationLogoUrl !== undefined
            ? { organizationLogoUrl: nextOrganizationLogoUrl }
            : {}),
          ...(typeof parsed.contactEmail === "string" ? { contactEmail: parsed.contactEmail } : {}),
          ...(typeof parsed.currency === "string" ? { currency: parsed.currency } : {}),
          ...(typeof parsed.storeStatus === "string" ? { storeStatus: parsed.storeStatus } : {}),
          ...(parsed.featuredReleaseId !== undefined
            ? { featuredReleaseId: parsed.featuredReleaseId }
            : {}),
        },
      });

      if (typeof parsed.orgName === "string") {
        await tx.organization.updateMany({
          where: { id: auth.context.organizationId },
          data: { name: parsed.orgName },
        });
      }

      if (shouldConvertReleaseCurrencies && exchangeRate !== null && typeof parsed.currency === "string") {
        const releases = await tx.release.findMany({
          where: { organizationId: auth.context.organizationId },
          select: {
            id: true,
            pricingMode: true,
            priceCents: true,
            fixedPriceCents: true,
            minimumPriceCents: true,
          },
        });

        for (const release of releases) {
          if (release.pricingMode === "FREE") {
            await tx.release.update({
              where: { id: release.id },
              data: {
                currency: parsed.currency,
                priceCents: 0,
                fixedPriceCents: null,
                minimumPriceCents: null,
              },
            });
            continue;
          }

          if (release.pricingMode === "FIXED") {
            const sourceFixed = release.fixedPriceCents ?? release.priceCents;
            const convertedFixed = Math.max(
              minimumPriceFloorCents,
              convertAmountCents({ cents: sourceFixed, rate: exchangeRate }),
            );

            await tx.release.update({
              where: { id: release.id },
              data: {
                currency: parsed.currency,
                priceCents: convertedFixed,
                fixedPriceCents: convertedFixed,
                minimumPriceCents: null,
              },
            });
            continue;
          }

          const sourceMinimum = release.minimumPriceCents ?? release.priceCents;
          const convertedMinimumRaw = convertAmountCents({
            cents: sourceMinimum,
            rate: exchangeRate,
          });
          const convertedMinimum =
            sourceMinimum <= 0
              ? 0
              : Math.max(minimumPriceFloorCents, convertedMinimumRaw);

          await tx.release.update({
            where: { id: release.id },
            data: {
              currency: parsed.currency,
              priceCents: convertedMinimum,
              fixedPriceCents: null,
              minimumPriceCents: convertedMinimum,
            },
          });
        }
      }

      if (adminEmailChanged && typeof normalizedNextAdminEmail === "string") {
        await tx.user.update({
          where: { id: auth.context.session.userId },
          data: { email: normalizedNextAdminEmail },
        });
      }

      return storeSettingsUpdateResult;
    });

    if (updateResult.count === 0) {
      return NextResponse.json(
        { ok: false, error: "Store settings could not be found." },
        { status: 404 },
      );
    }

    const settings = await prisma.storeSettings.findFirst({
      where: { organizationId: auth.context.organizationId },
      select: {
        storeName: true,
        organizationLogoUrl: true,
        contactEmail: true,
        currency: true,
        storeStatus: true,
        featuredReleaseId: true,
        organization: {
          select: { name: true },
        },
      },
    });

    const adminUser = await prisma.user.findUnique({
      where: { id: auth.context.session.userId },
      select: { email: true },
    });

    return NextResponse.json({
      ok: true,
      data: {
        orgName: settings?.organization?.name ?? "",
        storeName: settings?.storeName ?? "",
        organizationLogoUrl: settings?.organizationLogoUrl ?? null,
        contactEmail: settings?.contactEmail ?? "",
        adminEmail: adminUser?.email ?? normalizedNextAdminEmail ?? auth.context.session.email,
        currency: settings?.currency ?? "USD",
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

    if (isUniqueConstraintError(error)) {
      return NextResponse.json(
        { ok: false, error: "That admin email is already in use." },
        { status: 409 },
      );
    }

    if (error instanceof Error) {
      return NextResponse.json(
        { ok: false, error: error.message || "Failed to save store settings." },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { ok: false, error: "Failed to save store settings." },
      { status: 500 },
    );
  }
}
