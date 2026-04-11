import crypto from "node:crypto";

import { NextResponse } from "next/server";
import Stripe from "stripe";

import {
  buildLibraryMagicLinkUrl,
  createBuyerLibraryTokenExpiresAt,
} from "@/lib/checkout/buyer-library-link";
import { sendPurchaseConfirmationEmail } from "@/lib/checkout/purchase-confirmation-email";
import { ensureReleaseFilesForCheckout } from "@/lib/checkout/release-files";
import { decryptSecret } from "@/lib/crypto/secret-box";
import { logEvent } from "@/lib/logging";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function createToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function createOrderNumber() {
  const timestamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const suffix = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `STRIPE-${timestamp}-${suffix}`;
}

function normalizeCurrency(raw: string | null | undefined) {
  const trimmed = raw?.trim();
  if (!trimmed || trimmed.length !== 3) {
    return "USD";
  }

  return trimmed.toUpperCase();
}

function getSessionEmail(session: Stripe.Checkout.Session) {
  return (
    session.customer_details?.email?.trim().toLowerCase() ??
    session.customer_email?.trim().toLowerCase() ??
    null
  );
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

function isCheckoutSessionIdUniqueConstraintError(error: unknown) {
  if (!isUniqueConstraintError(error)) {
    return false;
  }

  if (
    typeof error !== "object" ||
    error === null ||
    !("meta" in error) ||
    typeof error.meta !== "object" ||
    error.meta === null ||
    !("target" in error.meta)
  ) {
    return false;
  }

  const target = error.meta.target;
  if (!Array.isArray(target)) {
    return false;
  }

  return target.includes("checkoutSessionId");
}

async function readStripeWebhookSecret() {
  const state = await prisma.setupWizardState.findUnique({
    where: { singletonKey: 1 },
    select: { stripeWebhookSecret: true },
  });

  return (
    decryptSecret(state?.stripeWebhookSecret) ??
    process.env.STRIPE_WEBHOOK_SECRET?.trim() ??
    null
  );
}

function readRecord(value: unknown) {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readStringField(value: unknown, fieldName: string) {
  const record = readRecord(value);
  if (!record) {
    return null;
  }

  const field = record[fieldName];
  if (typeof field !== "string") {
    return null;
  }

  const trimmed = field.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readNumberField(value: unknown, fieldName: string) {
  const record = readRecord(value);
  if (!record) {
    return null;
  }

  const field = record[fieldName];
  if (typeof field !== "number" || !Number.isFinite(field)) {
    return null;
  }

  return Math.max(0, Math.round(field));
}

function readBooleanField(value: unknown, fieldName: string) {
  const record = readRecord(value);
  if (!record) {
    return false;
  }

  return record[fieldName] === true;
}

function readStripeExpandableId(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  const record = readRecord(value);
  if (!record) {
    return null;
  }

  const id = record.id;
  if (typeof id !== "string") {
    return null;
  }

  const trimmed = id.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readPaymentIntentId(value: unknown) {
  const record = readRecord(value);
  if (!record) {
    return null;
  }

  return readStripeExpandableId(record.payment_intent);
}

async function syncRefundStatusByPaymentIntent(input: {
  paymentIntentId: string | null;
  refundedAmountCents: number;
  fullyRefunded: boolean;
}) {
  if (!input.paymentIntentId || input.refundedAmountCents <= 0) {
    return false;
  }

  const order = await prisma.order.findFirst({
    where: { paymentIntentId: input.paymentIntentId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      totalCents: true,
      status: true,
    },
  });

  if (!order) {
    return false;
  }

  const shouldMarkRefunded =
    input.fullyRefunded || input.refundedAmountCents >= order.totalCents;
  if (!shouldMarkRefunded || order.status === "REFUNDED") {
    return false;
  }

  await prisma.order.update({
    where: { id: order.id },
    data: { status: "REFUNDED" },
  });

  return true;
}

async function handleRefundWebhookEvent(event: Stripe.Event) {
  if (event.type === "charge.refunded") {
    const object = event.data.object;
    return syncRefundStatusByPaymentIntent({
      paymentIntentId: readPaymentIntentId(object),
      refundedAmountCents: readNumberField(object, "amount_refunded") ?? 0,
      fullyRefunded: readBooleanField(object, "refunded"),
    });
  }

  if (event.type === "refund.updated") {
    const object = event.data.object;
    if (readStringField(object, "status") !== "succeeded") {
      return false;
    }

    return syncRefundStatusByPaymentIntent({
      paymentIntentId: readPaymentIntentId(object),
      refundedAmountCents: readNumberField(object, "amount") ?? 0,
      fullyRefunded: false,
    });
  }

  return false;
}

type FinalizeResult =
  | {
      status: "send-email";
      duplicate: boolean;
      orderId: string;
      customerEmail: string;
      releaseTitle: string;
      totalCents: number;
      currency: string;
      libraryMagicLinkUrl: string;
    }
  | { status: "duplicate-noop" };

async function finalizeCheckoutSession(
  session: Stripe.Checkout.Session,
): Promise<FinalizeResult> {
  const checkoutSessionId = session.id;
  const organizationId = session.metadata?.organizationId?.trim() ?? null;
  const releaseId = session.metadata?.releaseId?.trim() ?? null;
  const customerEmail = getSessionEmail(session);

  if (!organizationId || !releaseId || !customerEmail) {
    throw new Error("Checkout session is missing required metadata.");
  }

  const now = new Date();
  const subtotalCents = session.amount_subtotal ?? 0;
  const totalCents = session.amount_total ?? subtotalCents;
  const taxCents = session.total_details?.amount_tax ?? 0;
  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : null;
  const expiresAt = createBuyerLibraryTokenExpiresAt(now);

  try {
    return await prisma.$transaction(async (tx) => {
      const existingOrder = await tx.order.findUnique({
        where: { checkoutSessionId },
        select: {
          id: true,
          organizationId: true,
          customerId: true,
          emailStatus: true,
          currency: true,
          totalCents: true,
          customer: {
            select: { email: true },
          },
          items: {
            orderBy: { lineNumber: "asc" },
            take: 1,
            select: {
              release: {
                select: { title: true },
              },
            },
          },
        },
      });
      if (existingOrder) {
        if (existingOrder.emailStatus === "SENT") {
          return { status: "duplicate-noop" };
        }

        const releaseTitle = existingOrder.items[0]?.release.title;
        if (!releaseTitle) {
          throw new Error("Order is missing release details.");
        }

        const libraryToken = await tx.buyerLibraryToken.create({
          data: {
            organizationId: existingOrder.organizationId,
            customerId: existingOrder.customerId,
            token: createToken(),
            expiresAt,
          },
          select: { token: true },
        });

        return {
          status: "send-email",
          duplicate: true,
          orderId: existingOrder.id,
          customerEmail: existingOrder.customer.email,
          releaseTitle,
          totalCents: existingOrder.totalCents,
          currency: normalizeCurrency(existingOrder.currency),
          libraryMagicLinkUrl: buildLibraryMagicLinkUrl(libraryToken.token),
        };
      }

      const release = await tx.release.findFirst({
        where: {
          id: releaseId,
          organizationId,
          deletedAt: null,
        },
        select: {
          id: true,
          title: true,
        },
      });
      if (!release) {
        throw new Error("Release not found for checkout session.");
      }

      const customer = await tx.customer.upsert({
        where: {
          organizationId_email: {
            organizationId,
            email: customerEmail,
          },
        },
        create: {
          organizationId,
          email: customerEmail,
        },
        update: {},
        select: { id: true },
      });

      const order = await tx.order.create({
        data: {
          organizationId,
          customerId: customer.id,
          orderNumber: createOrderNumber(),
          status: "FULFILLED",
          currency: normalizeCurrency(session.currency),
          subtotalCents,
          taxCents,
          totalCents,
          checkoutSessionId,
          paymentIntentId,
          taxCentsFromStripe: taxCents,
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
          unitPriceCents: subtotalCents,
          totalPriceCents: subtotalCents,
        },
        select: { id: true },
      });

      const releaseFiles = await ensureReleaseFilesForCheckout(tx, {
        releaseId: release.id,
        organizationId,
      });

      if (releaseFiles.length === 0) {
        throw new Error("Release has no downloadable files.");
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
          organizationId,
          customerId: customer.id,
          token: createToken(),
          expiresAt,
        },
        select: { token: true },
      });

      return {
        status: "send-email",
        duplicate: false,
        orderId: order.id,
        customerEmail,
        releaseTitle: release.title,
        totalCents,
        currency: normalizeCurrency(session.currency),
        libraryMagicLinkUrl: buildLibraryMagicLinkUrl(libraryToken.token),
      };
    });
  } catch (error) {
    if (isCheckoutSessionIdUniqueConstraintError(error)) {
      return { status: "duplicate-noop" };
    }

    throw error;
  }
}

export async function POST(request: Request) {
  const stripeSignature = request.headers.get("stripe-signature");
  if (!stripeSignature) {
    return NextResponse.json(
      { ok: false, error: "Missing Stripe signature." },
      { status: 400 },
    );
  }

  const webhookSecret = await readStripeWebhookSecret();
  if (!webhookSecret) {
    return NextResponse.json(
      { ok: false, error: "Stripe webhook is not configured." },
      { status: 503 },
    );
  }

  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = Stripe.webhooks.constructEvent(
      payload,
      stripeSignature,
      webhookSecret,
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid Stripe signature." },
      { status: 400 },
    );
  }

  logEvent("info", "webhook.received", {
    provider: "stripe",
    eventType: event.type,
    eventId: event.id,
  });

  if (event.type === "charge.refunded" || event.type === "refund.updated") {
    const refundSynced = await handleRefundWebhookEvent(event);
    if (!refundSynced) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    return NextResponse.json({ ok: true, refundSynced: true });
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  if (session.payment_status !== "paid") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  try {
    const finalized = await finalizeCheckoutSession(session);
    if (finalized.status === "duplicate-noop") {
      return NextResponse.json({
        ok: true,
        duplicate: true,
      });
    }

    try {
      await sendPurchaseConfirmationEmail({
        email: finalized.customerEmail,
        releaseTitle: finalized.releaseTitle,
        libraryMagicLinkUrl: finalized.libraryMagicLinkUrl,
        amountPaidCents: finalized.totalCents,
        currency: finalized.currency,
      });

      await prisma.order.update({
        where: { id: finalized.orderId },
        data: {
          emailStatus: "SENT",
          emailSentAt: new Date(),
        },
      });
    } catch {
      await prisma.order.update({
        where: { id: finalized.orderId },
        data: {
          emailStatus: "FAILED",
          emailSentAt: null,
        },
      });
      logEvent("warn", "email.failed", {
        channel: "purchase_confirmation",
        orderId: finalized.orderId,
      });

      return NextResponse.json(
        {
          ok: false,
          error: "Could not send purchase confirmation email.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      duplicate: finalized.duplicate,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not finalize checkout session." },
      { status: 500 },
    );
  }
}
