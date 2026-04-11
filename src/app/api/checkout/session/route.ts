import Stripe from "stripe";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  ALREADY_OWNED_CONFIRMATION_REQUIRED_CODE,
  hasExistingReleaseOwnership,
} from "@/lib/checkout/ownership-check";
import { resolveCheckoutAmountCents } from "@/lib/checkout/session-pricing";
import { decryptSecret } from "@/lib/crypto/secret-box";
import { prisma } from "@/lib/prisma";
import {
  readMinimumPriceFloorCentsFromEnv,
  readStripeFeeEstimateConfigForCurrencyFromEnv,
  resolveMinimumChargeCentsForPositiveNet,
  resolveMinimumPriceFloorMinorForCurrency,
} from "@/lib/pricing/pricing-rules";
import { enforceCsrfProtection } from "@/lib/security/csrf";
import { checkoutRateLimitPolicies } from "@/lib/security/checkout-policies";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";

const createCheckoutSessionSchema = z.object({
  releaseId: z.string().trim().min(1),
  amountCents: z.number().int().nonnegative().optional(),
  email: z.email().max(320),
  confirmAlreadyOwned: z.boolean().optional(),
  successUrl: z.string().trim().min(1),
  cancelUrl: z.string().trim().min(1),
});

function normalizeCheckoutUrl(raw: string, request: Request) {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return parsed.toString();
    }

    return null;
  } catch {
    if (!raw.startsWith("/")) {
      return null;
    }

    try {
      return new URL(raw, request.url).toString();
    } catch {
      return null;
    }
  }
}

function normalizeCurrency(raw: string | null | undefined) {
  const value = raw?.trim().toLowerCase();
  return value && value.length === 3 ? value : "usd";
}

export async function POST(request: Request) {
  const csrfError = enforceCsrfProtection(request);
  if (csrfError) {
    return csrfError;
  }

  const rateLimitError = await enforceRateLimit(
    request,
    checkoutRateLimitPolicies.session,
  );
  if (rateLimitError) {
    return rateLimitError;
  }

  try {
    const payload = await request.json();
    const parsed = createCheckoutSessionSchema.parse(payload);
    const normalizedEmail = parsed.email.trim().toLowerCase();

    const [settings, stripeState] = await Promise.all([
      prisma.storeSettings.findFirst({
        select: {
          setupComplete: true,
          organizationId: true,
          currency: true,
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.setupWizardState.findUnique({
        where: { singletonKey: 1 },
        select: { stripeSecretKey: true },
      }),
    ]);

    if (!settings?.setupComplete) {
      return NextResponse.json(
        { ok: false, error: "Setup must be complete before checkout." },
        { status: 409 },
      );
    }

    const stripeSecretKey =
      decryptSecret(stripeState?.stripeSecretKey) ??
      process.env.STRIPE_SECRET_KEY?.trim() ??
      null;
    if (!stripeSecretKey) {
      return NextResponse.json(
        { ok: false, error: "Stripe is not configured." },
        { status: 409 },
      );
    }

    const release = await prisma.release.findFirst({
      where: {
        id: parsed.releaseId,
        organizationId: settings.organizationId,
        status: "PUBLISHED",
        deletedAt: null,
      },
      select: {
        id: true,
        title: true,
        pricingMode: true,
        priceCents: true,
        fixedPriceCents: true,
        minimumPriceCents: true,
      },
    });

    if (!release) {
      return NextResponse.json(
        { ok: false, error: "Release not found." },
        { status: 404 },
      );
    }

    const floorCentsBase = await resolveMinimumPriceFloorMinorForCurrency(
      settings.currency,
    ).catch(() => readMinimumPriceFloorCentsFromEnv());
    const feeConfig = readStripeFeeEstimateConfigForCurrencyFromEnv(settings.currency);
    const stripeNetFloorCents = resolveMinimumChargeCentsForPositiveNet(feeConfig);
    const floorCents = Math.max(floorCentsBase, stripeNetFloorCents);
    const resolvedAmount = resolveCheckoutAmountCents({
      currency: settings.currency,
      pricingMode: release.pricingMode,
      floorCents,
      priceCents: release.priceCents,
      fixedPriceCents: release.fixedPriceCents,
      minimumPriceCents: release.minimumPriceCents,
      pwywAmountCents: parsed.amountCents,
    });

    if (!resolvedAmount.ok) {
      return NextResponse.json(
        { ok: false, error: resolvedAmount.error },
        { status: 400 },
      );
    }

    if (resolvedAmount.amountCents > 0 && parsed.confirmAlreadyOwned !== true) {
      const alreadyOwned = await hasExistingReleaseOwnership({
        organizationId: settings.organizationId,
        releaseId: release.id,
        email: normalizedEmail,
      });

      if (alreadyOwned) {
        return NextResponse.json(
          {
            ok: false,
            code: ALREADY_OWNED_CONFIRMATION_REQUIRED_CODE,
            error:
              "This email already owns this release. Continue anyway to create a new purchase?",
          },
          { status: 409 },
        );
      }
    }

    const successUrl = normalizeCheckoutUrl(parsed.successUrl, request);
    if (!successUrl) {
      return NextResponse.json(
        { ok: false, error: "Provide a valid successUrl." },
        { status: 400 },
      );
    }

    const cancelUrl = normalizeCheckoutUrl(parsed.cancelUrl, request);
    if (!cancelUrl) {
      return NextResponse.json(
        { ok: false, error: "Provide a valid cancelUrl." },
        { status: 400 },
      );
    }

    const stripe = new Stripe(stripeSecretKey);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: normalizedEmail,
      automatic_tax: { enabled: true },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: normalizeCurrency(settings.currency),
            unit_amount: resolvedAmount.amountCents,
            product_data: {
              name: release.title,
            },
          },
        },
      ],
      metadata: {
        organizationId: settings.organizationId,
        releaseId: release.id,
        pricingMode: release.pricingMode,
        amountCents: String(resolvedAmount.amountCents),
      },
    });

    if (!session.url) {
      return NextResponse.json(
        { ok: false, error: "Stripe did not return a checkout URL." },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        checkoutSessionId: session.id,
        checkoutUrl: session.url,
      },
      {
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: "Invalid checkout payload.", issues: error.issues },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: "Could not create checkout session. Verify Stripe configuration and try again.",
      },
      { status: 502 },
    );
  }
}
