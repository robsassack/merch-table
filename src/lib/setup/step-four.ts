import Stripe from "stripe";
import { z } from "zod";

import { decryptSecret, encryptSecret } from "@/lib/crypto/secret-box";
import { prisma } from "@/lib/prisma";

export const stepFourSchema = z.object({
  stripeSecretKey: z
    .string()
    .trim()
    .max(255),
  stripeWebhookSecret: z
    .string()
    .trim()
    .min(1, "Stripe webhook secret is required.")
    .max(255),
});

export type StepFourInput = z.infer<typeof stepFourSchema>;

export type StepFourState = {
  hasSecretKey: boolean;
  stripeWebhookSecret: string;
  webhookUrl: string;
  verified: boolean;
  verifiedAt: string | null;
  lastError: string | null;
};

const DEFAULT_STRIPE_VERIFY_TIMEOUT_MS = 15_000;

function getWebhookUrl() {
  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const normalizedBaseUrl = baseUrl.endsWith("/")
    ? baseUrl.slice(0, -1)
    : baseUrl;

  return `${normalizedBaseUrl}/api/webhooks/stripe`;
}

export async function getStepFourState(): Promise<StepFourState> {
  const state = await prisma.setupWizardState.findUnique({
    where: { singletonKey: 1 },
    select: {
      stripeSecretKey: true,
      stripeWebhookSecret: true,
      stripeVerifiedAt: true,
      stripeLastError: true,
    },
  });

  return {
    hasSecretKey: Boolean(state?.stripeSecretKey),
    stripeWebhookSecret: decryptSecret(state?.stripeWebhookSecret) ?? "",
    webhookUrl: getWebhookUrl(),
    verified: Boolean(state?.stripeVerifiedAt),
    verifiedAt: state?.stripeVerifiedAt?.toISOString() ?? null,
    lastError: state?.stripeLastError ?? null,
  };
}

export async function saveStepFourState(input: StepFourInput) {
  const parsed = stepFourSchema.parse(input);
  const existing = await prisma.setupWizardState.findUnique({
    where: { singletonKey: 1 },
    select: { stripeSecretKey: true },
  });

  const nextSecretKey =
    parsed.stripeSecretKey.trim().length > 0
      ? parsed.stripeSecretKey
      : decryptSecret(existing?.stripeSecretKey) ?? null;

  if (!nextSecretKey) {
    throw new Error("Stripe API key is required.");
  }

  await prisma.setupWizardState.upsert({
    where: { singletonKey: 1 },
    create: {
      singletonKey: 1,
      stripeSecretKey: encryptSecret(nextSecretKey),
      stripeWebhookSecret: encryptSecret(parsed.stripeWebhookSecret),
      stripeVerifiedAt: null,
      stripeLastError: null,
    },
    update: {
      stripeSecretKey: encryptSecret(nextSecretKey),
      stripeWebhookSecret: encryptSecret(parsed.stripeWebhookSecret),
      stripeVerifiedAt: null,
      stripeLastError: null,
    },
  });

  return getStepFourState();
}

export async function verifyStripeConnection() {
  const state = await prisma.setupWizardState.findUnique({
    where: { singletonKey: 1 },
    select: {
      id: true,
      stripeSecretKey: true,
      stripeWebhookSecret: true,
    },
  });

  if (!state?.stripeSecretKey || !state.stripeWebhookSecret) {
    throw new Error("Save Stripe API key and webhook secret before verification.");
  }

  const stripeSecretKey = decryptSecret(state.stripeSecretKey);
  if (!stripeSecretKey) {
    throw new Error("Stripe API key is missing.");
  }

  const stripeVerifyTimeoutMs = Number.parseInt(
    process.env.STRIPE_VERIFY_TIMEOUT_MS ?? "",
    10,
  );
  const effectiveTimeoutMs =
    Number.isInteger(stripeVerifyTimeoutMs) && stripeVerifyTimeoutMs > 0
      ? stripeVerifyTimeoutMs
      : DEFAULT_STRIPE_VERIFY_TIMEOUT_MS;

  const stripe = new Stripe(stripeSecretKey, {
    timeout: effectiveTimeoutMs,
    maxNetworkRetries: 0,
  });
  await stripe.balance.retrieve();

  const now = new Date();
  await prisma.setupWizardState.update({
    where: { id: state.id },
    data: {
      stripeVerifiedAt: now,
      stripeLastError: null,
    },
  });

  return {
    verifiedAt: now.toISOString(),
    message: "Stripe API key is valid and reachable.",
  };
}

export async function markStripeVerificationFailed(errorMessage: string) {
  await prisma.setupWizardState.updateMany({
    where: { singletonKey: 1 },
    data: {
      stripeVerifiedAt: null,
      stripeLastError: errorMessage,
    },
  });
}

export function isStepFourComplete(state: StepFourState) {
  return state.hasSecretKey && state.stripeWebhookSecret.length > 0 && state.verified;
}
