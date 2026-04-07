import crypto from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import {
  buildLibraryMagicLinkUrl,
  createBuyerLibraryTokenExpiresAt,
} from "@/lib/checkout/buyer-library-link";
import { sendFreeLibraryLinkEmail } from "@/lib/checkout/free-library-link-email";
import { ensureReleaseFilesForCheckout } from "@/lib/checkout/release-files";
import { prisma } from "@/lib/prisma";
import { checkoutRateLimitPolicies } from "@/lib/security/checkout-policies";
import { enforceCsrfProtection } from "@/lib/security/csrf";
import {
  createHashedRateLimitKey,
  enforceRateLimit,
} from "@/lib/security/rate-limit";

export const runtime = "nodejs";

const freeCheckoutSchema = z.object({
  releaseId: z.string().trim().min(1),
  email: z.string().trim().min(1).max(320).email(),
});

function normalizeCurrency(raw: string | null | undefined) {
  const trimmed = raw?.trim();
  if (!trimmed || trimmed.length !== 3) {
    return "USD";
  }

  return trimmed.toUpperCase();
}


function createToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function createOrderNumber() {
  const timestamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const suffix = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `FREE-${timestamp}-${suffix}`;
}

export async function POST(request: Request) {
  const csrfError = enforceCsrfProtection(request);
  if (csrfError) {
    return csrfError;
  }

  const ipRateLimitError = await enforceRateLimit(
    request,
    checkoutRateLimitPolicies.freeByIp,
  );
  if (ipRateLimitError) {
    return ipRateLimitError;
  }

  try {
    const payload = await request.json();
    const email =
      payload && typeof payload === "object" && "email" in payload
        ? String(payload.email ?? "").trim()
        : "";

    if (!email) {
      return NextResponse.json(
        { ok: false, error: "Email is required." },
        { status: 400 },
      );
    }

    const parsed = freeCheckoutSchema.parse(payload);
    const normalizedEmail = parsed.email.trim().toLowerCase();

    const emailRateLimitError = await enforceRateLimit(
      request,
      checkoutRateLimitPolicies.freeByEmail,
      {
        key: `checkout-free-email:${createHashedRateLimitKey(normalizedEmail)}`,
      },
    );
    if (emailRateLimitError) {
      return emailRateLimitError;
    }

    const settings = await prisma.storeSettings.findFirst({
      select: {
        setupComplete: true,
        organizationId: true,
        currency: true,
      },
      orderBy: { createdAt: "asc" },
    });

    if (!settings?.setupComplete) {
      return NextResponse.json(
        { ok: false, error: "Setup must be complete before checkout." },
        { status: 409 },
      );
    }

    const release = await prisma.release.findFirst({
      where: {
        id: parsed.releaseId,
        organizationId: settings.organizationId,
        status: "PUBLISHED",
        deletedAt: null,
        OR: [
          { pricingMode: "FREE" },
          { pricingMode: "PWYW", minimumPriceCents: 0 },
        ],
      },
      select: {
        id: true,
        title: true,
      },
    });

    if (!release) {
      return NextResponse.json(
        { ok: false, error: "Free release not found." },
        { status: 404 },
      );
    }

    const now = new Date();
    const expiresAt = createBuyerLibraryTokenExpiresAt(now);

    const creationResult = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.upsert({
        where: {
          organizationId_email: {
            organizationId: settings.organizationId,
            email: normalizedEmail,
          },
        },
        create: {
          organizationId: settings.organizationId,
          email: normalizedEmail,
        },
        update: {},
        select: { id: true },
      });

      const order = await tx.order.create({
        data: {
          organizationId: settings.organizationId,
          customerId: customer.id,
          orderNumber: createOrderNumber(),
          status: "FULFILLED",
          currency: normalizeCurrency(settings.currency),
          subtotalCents: 0,
          taxCents: 0,
          totalCents: 0,
          paidAt: now,
        },
        select: { id: true },
      });

      const orderItem = await tx.orderItem.create({
        data: {
          orderId: order.id,
          releaseId: release.id,
          lineNumber: 1,
          quantity: 1,
          unitPriceCents: 0,
          totalPriceCents: 0,
        },
        select: { id: true },
      });

      const releaseFiles = await ensureReleaseFilesForCheckout(tx, {
        releaseId: release.id,
        organizationId: settings.organizationId,
      });

      if (releaseFiles.length === 0) {
        throw new Error("Release has no downloadable files yet.");
      }

      await tx.downloadEntitlement.createMany({
        data: releaseFiles.map((file) => ({
          customerId: customer.id,
          releaseId: release.id,
          releaseFileId: file.id,
          orderItemId: orderItem.id,
          token: createToken(),
        })),
      });

      const libraryToken = await tx.buyerLibraryToken.create({
        data: {
          organizationId: settings.organizationId,
          customerId: customer.id,
          token: createToken(),
          expiresAt,
        },
        select: { token: true },
      });

      return {
        orderId: order.id,
        libraryToken: libraryToken.token,
      };
    });

    const libraryMagicLinkUrl = buildLibraryMagicLinkUrl(
      creationResult.libraryToken,
    );

    try {
      await sendFreeLibraryLinkEmail({
        email: normalizedEmail,
        releaseTitle: release.title,
        libraryMagicLinkUrl,
      });

      await prisma.order.update({
        where: { id: creationResult.orderId },
        data: {
          emailStatus: "SENT",
          emailSentAt: new Date(),
        },
      });
    } catch {
      await prisma.order.update({
        where: { id: creationResult.orderId },
        data: {
          emailStatus: "FAILED",
          emailSentAt: null,
        },
      });

      return NextResponse.json(
        {
          ok: false,
          error:
            "Could not send library link email. Please try again in a few minutes.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json(
      { ok: true },
      {
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Release has no downloadable files yet."
    ) {
      return NextResponse.json(
        { ok: false, error: "Release has no downloadable files yet." },
        { status: 409 },
      );
    }

    if (error instanceof z.ZodError) {
      const missingEmail = error.issues.some(
        (issue) => issue.path[0] === "email" && issue.code === "invalid_type",
      );
      if (missingEmail) {
        return NextResponse.json(
          { ok: false, error: "Email is required." },
          { status: 400 },
        );
      }

      return NextResponse.json(
        {
          ok: false,
          error: "Invalid free checkout payload.",
          issues: error.issues,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { ok: false, error: "Could not complete free checkout." },
      { status: 500 },
    );
  }
}
