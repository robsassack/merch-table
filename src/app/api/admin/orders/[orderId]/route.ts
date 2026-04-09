import crypto from "node:crypto";

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { z } from "zod";

import {
  buildLibraryMagicLinkUrl,
  createBuyerLibraryTokenExpiresAt,
} from "@/lib/checkout/buyer-library-link";
import { sendFreeLibraryLinkEmail } from "@/lib/checkout/free-library-link-email";
import { sendPurchaseConfirmationEmail } from "@/lib/checkout/purchase-confirmation-email";
import { requireAdminRequestContext } from "@/lib/admin/request-context";
import { decryptSecret } from "@/lib/crypto/secret-box";
import { prisma } from "@/lib/prisma";
import { enforceCsrfProtection } from "@/lib/security/csrf";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ orderId: string }>;
};

const retryEmailActionSchema = z.object({
  action: z.literal("retry-email"),
});

const resendLibraryLinkActionSchema = z.object({
  action: z.literal("resend-library-link"),
});

const refundOrderActionSchema = z.object({
  action: z.literal("refund-order"),
});

const revokeLibraryTokenActionSchema = z.object({
  action: z.literal("revoke-library-token"),
  tokenId: z.string().trim().min(1),
});

const orderActionSchema = z.discriminatedUnion("action", [
  retryEmailActionSchema,
  resendLibraryLinkActionSchema,
  refundOrderActionSchema,
  revokeLibraryTokenActionSchema,
]);

function createToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function normalizeCurrency(raw: string | null | undefined) {
  const trimmed = raw?.trim().toUpperCase();
  if (!trimmed || trimmed.length !== 3) {
    return "USD";
  }

  return trimmed;
}

async function readStripeSecretKey() {
  const state = await prisma.setupWizardState.findUnique({
    where: { singletonKey: 1 },
    select: { stripeSecretKey: true },
  });

  return (
    decryptSecret(state?.stripeSecretKey) ?? process.env.STRIPE_SECRET_KEY?.trim() ?? null
  );
}

async function loadOrderForAction(input: { orderId: string; organizationId: string }) {
  return prisma.order.findFirst({
    where: {
      id: input.orderId,
      organizationId: input.organizationId,
    },
    select: {
      id: true,
      organizationId: true,
      customerId: true,
      orderNumber: true,
      status: true,
      emailStatus: true,
      totalCents: true,
      currency: true,
      paymentIntentId: true,
      checkoutSessionId: true,
      customer: {
        select: {
          email: true,
        },
      },
      items: {
        orderBy: { lineNumber: "asc" },
        take: 1,
        select: {
          release: {
            select: {
              title: true,
            },
          },
        },
      },
    },
  });
}

async function sendLibraryLinkEmailForOrder(order: NonNullable<Awaited<ReturnType<typeof loadOrderForAction>>>) {
  const releaseTitle = order.items[0]?.release.title;
  if (!releaseTitle) {
    throw new Error("Order is missing release information.");
  }

  const now = new Date();
  const libraryToken = await prisma.buyerLibraryToken.create({
    data: {
      organizationId: order.organizationId,
      customerId: order.customerId,
      token: createToken(),
      expiresAt: createBuyerLibraryTokenExpiresAt(now),
    },
    select: {
      token: true,
    },
  });

  const libraryMagicLinkUrl = buildLibraryMagicLinkUrl(libraryToken.token);
  const isFreeOrder = order.totalCents <= 0;

  if (isFreeOrder) {
    await sendFreeLibraryLinkEmail({
      email: order.customer.email,
      releaseTitle,
      libraryMagicLinkUrl,
    });
  } else {
    await sendPurchaseConfirmationEmail({
      email: order.customer.email,
      releaseTitle,
      libraryMagicLinkUrl,
      amountPaidCents: order.totalCents,
      currency: normalizeCurrency(order.currency),
    });
  }

  await prisma.order.update({
    where: { id: order.id },
    data: {
      emailStatus: "SENT",
      emailSentAt: now,
    },
  });

  return libraryMagicLinkUrl;
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

  const { orderId } = await context.params;
  if (!orderId) {
    return NextResponse.json({ ok: false, error: "Order id is required." }, { status: 400 });
  }

  const order = await loadOrderForAction({
    orderId,
    organizationId: auth.context.organizationId,
  });
  if (!order) {
    return NextResponse.json({ ok: false, error: "Order not found." }, { status: 404 });
  }

  try {
    const payload = await request.json();
    const parsed = orderActionSchema.parse(payload);

    if (parsed.action === "refund-order") {
      if (order.totalCents <= 0) {
        return NextResponse.json(
          { ok: false, error: "Free orders cannot be refunded." },
          { status: 409 },
        );
      }

      if (!order.paymentIntentId) {
        return NextResponse.json(
          { ok: false, error: "Order is missing payment intent details." },
          { status: 409 },
        );
      }

      if (order.status === "REFUNDED") {
        return NextResponse.json({ ok: true, alreadyRefunded: true });
      }

      const stripeSecretKey = await readStripeSecretKey();
      if (!stripeSecretKey) {
        return NextResponse.json(
          { ok: false, error: "Stripe is not configured." },
          { status: 503 },
        );
      }

      const stripe = new Stripe(stripeSecretKey);
      const refund = await stripe.refunds.create({
        payment_intent: order.paymentIntentId,
        reason: "requested_by_customer",
        metadata: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          actionedBy: auth.context.session.email,
        },
      });

      if (refund.status === "succeeded") {
        await prisma.order.update({
          where: { id: order.id },
          data: { status: "REFUNDED" },
        });
      }

      return NextResponse.json({
        ok: true,
        refundId: refund.id,
        refundStatus: refund.status,
      });
    }

    if (parsed.action === "revoke-library-token") {
      const token = await prisma.buyerLibraryToken.findFirst({
        where: {
          id: parsed.tokenId,
          organizationId: auth.context.organizationId,
          customerId: order.customerId,
        },
        select: {
          id: true,
          revokedAt: true,
        },
      });

      if (!token) {
        return NextResponse.json(
          { ok: false, error: "Library token not found for this order." },
          { status: 404 },
        );
      }

      if (!token.revokedAt) {
        await prisma.buyerLibraryToken.update({
          where: { id: token.id },
          data: { revokedAt: new Date() },
        });
      }

      return NextResponse.json({
        ok: true,
        revokedTokenId: token.id,
        alreadyRevoked: Boolean(token.revokedAt),
      });
    }

    if (parsed.action === "retry-email" && order.emailStatus !== "FAILED") {
      return NextResponse.json(
        { ok: false, error: "Retry is only available for failed email deliveries." },
        { status: 409 },
      );
    }

    try {
      const libraryMagicLinkUrl = await sendLibraryLinkEmailForOrder(order);
      return NextResponse.json({
        ok: true,
        action: parsed.action,
        libraryMagicLinkUrl,
      });
    } catch (error) {
      await prisma.order.update({
        where: { id: order.id },
        data: {
          emailStatus: "FAILED",
          emailSentAt: null,
        },
      });

      if (error instanceof Error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 502 });
      }

      return NextResponse.json(
        { ok: false, error: "Could not send library link email." },
        { status: 502 },
      );
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Invalid order action request." }, { status: 400 });
    }

    if (error instanceof Stripe.errors.StripeError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 502 });
    }

    if (error instanceof Error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: false, error: "Could not process order action." }, { status: 500 });
  }
}
