import crypto from "node:crypto";

import { NextResponse } from "next/server";
import Stripe from "stripe";

import { decryptSecret } from "@/lib/crypto/secret-box";
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

type FinalizeResult =
  | { status: "created"; orderId: string }
  | { status: "duplicate" };

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

  try {
    return await prisma.$transaction(async (tx) => {
      const existingOrder = await tx.order.findUnique({
        where: { checkoutSessionId },
        select: { id: true },
      });
      if (existingOrder) {
        return { status: "duplicate" };
      }

      const release = await tx.release.findFirst({
        where: {
          id: releaseId,
          organizationId,
          deletedAt: null,
        },
        select: {
          id: true,
          files: {
            select: { id: true },
          },
        },
      });
      if (!release) {
        throw new Error("Release not found for checkout session.");
      }

      if (release.files.length === 0) {
        throw new Error("Release has no downloadable files.");
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

      await tx.downloadEntitlement.createMany({
        data: release.files.map((file) => ({
          customerId: customer.id,
          releaseId: release.id,
          releaseFileId: file.id,
          orderItemId: orderItem.id,
          token: createToken(),
        })),
      });

      return { status: "created", orderId: order.id };
    });
  } catch (error) {
    if (isCheckoutSessionIdUniqueConstraintError(error)) {
      return { status: "duplicate" };
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

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  if (session.payment_status !== "paid") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  try {
    const finalized = await finalizeCheckoutSession(session);
    return NextResponse.json({
      ok: true,
      duplicate: finalized.status === "duplicate",
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not finalize checkout session." },
      { status: 500 },
    );
  }
}
