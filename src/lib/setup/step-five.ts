import crypto from "node:crypto";

import nodemailer from "nodemailer";
import { z } from "zod";

import { decryptSecret } from "@/lib/crypto/secret-box";
import { getAdminMagicLinkEmailHtml } from "@/lib/email/admin-magic-link-template";
import { prisma } from "@/lib/prisma";

const MAGIC_LINK_EXPIRY_MINUTES = 30;

export const stepFiveSchema = z.object({
  adminEmail: z.email("Enter a valid admin email.").max(320),
});

export type StepFiveInput = z.infer<typeof stepFiveSchema>;

export type StepFiveState = {
  adminEmail: string;
  magicLinkSent: boolean;
  magicLinkSentAt: string | null;
  magicLinkLastError: string | null;
};

const defaultState: StepFiveState = {
  adminEmail: "",
  magicLinkSent: false,
  magicLinkSentAt: null,
  magicLinkLastError: null,
};

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateToken() {
  return crypto.randomBytes(24).toString("base64url");
}

function getMagicLinkUrl(token: string) {
  const appBaseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const normalized = appBaseUrl.endsWith("/")
    ? appBaseUrl.slice(0, -1)
    : appBaseUrl;

  return `${normalized}/admin/auth/magic-link?token=${encodeURIComponent(token)}`;
}

export async function getStepFiveState(): Promise<StepFiveState> {
  const state = await prisma.setupWizardState.findUnique({
    where: { singletonKey: 1 },
    select: {
      adminEmail: true,
      adminMagicLinkSentAt: true,
      adminMagicLinkLastError: true,
    },
  });

  if (!state) {
    return defaultState;
  }

  return {
    adminEmail: state.adminEmail ?? "",
    magicLinkSent: Boolean(state.adminMagicLinkSentAt),
    magicLinkSentAt: state.adminMagicLinkSentAt?.toISOString() ?? null,
    magicLinkLastError: state.adminMagicLinkLastError ?? null,
  };
}

export async function saveStepFiveState(input: StepFiveInput) {
  const parsed = stepFiveSchema.parse(input);
  const existing = await prisma.setupWizardState.findUnique({
    where: { singletonKey: 1 },
    select: {
      adminEmail: true,
      adminMagicLinkSentAt: true,
    },
  });

  const adminEmailChanged =
    (existing?.adminEmail ?? "").trim().toLowerCase() !==
    parsed.adminEmail.trim().toLowerCase();

  await prisma.setupWizardState.upsert({
    where: { singletonKey: 1 },
    create: {
      singletonKey: 1,
      adminEmail: parsed.adminEmail,
      adminMagicLinkSentAt: null,
      adminMagicLinkLastError: null,
    },
    update: {
      adminEmail: parsed.adminEmail,
      adminMagicLinkSentAt: adminEmailChanged
        ? null
        : (existing?.adminMagicLinkSentAt ?? null),
      adminMagicLinkLastError: adminEmailChanged ? null : undefined,
    },
  });

  return getStepFiveState();
}

export async function sendFirstAdminMagicLink() {
  const state = await prisma.setupWizardState.findUnique({
    where: { singletonKey: 1 },
    select: {
      id: true,
      adminEmail: true,
      smtpHost: true,
      smtpPort: true,
      smtpUsername: true,
      smtpPassword: true,
      smtpSecure: true,
      smtpFromEmail: true,
    },
  });

  if (
    !state ||
    !state.adminEmail ||
    !state.smtpHost ||
    !state.smtpPort ||
    !state.smtpUsername ||
    !state.smtpPassword ||
    !state.smtpFromEmail
  ) {
    throw new Error("Complete SMTP setup and admin email before sending magic link.");
  }

  const smtpPassword = decryptSecret(state.smtpPassword);
  if (!smtpPassword) {
    throw new Error("Complete SMTP setup and admin email before sending magic link.");
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_MINUTES * 60_000);

  await prisma.adminMagicLinkToken.create({
    data: {
      email: state.adminEmail,
      tokenHash: hashToken(token),
      expiresAt,
    },
  });

  const transporter = nodemailer.createTransport({
    host: state.smtpHost,
    port: state.smtpPort,
    secure: state.smtpSecure,
    auth: {
      user: state.smtpUsername,
      pass: smtpPassword,
    },
  });

  await transporter.verify();

  const magicLinkUrl = getMagicLinkUrl(token);
  await transporter.sendMail({
    from: state.smtpFromEmail,
    to: state.adminEmail,
    subject: "Your Merch Table admin sign-in link",
    html: getAdminMagicLinkEmailHtml({
      magicLinkUrl,
      expiresInMinutes: MAGIC_LINK_EXPIRY_MINUTES,
    }),
  });

  const now = new Date();
  await prisma.setupWizardState.update({
    where: { id: state.id },
    data: {
      adminMagicLinkSentAt: now,
      adminMagicLinkLastError: null,
    },
  });

  return {
    sentAt: now.toISOString(),
    adminEmail: state.adminEmail,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function markAdminMagicLinkSendFailed(errorMessage: string) {
  await prisma.setupWizardState.updateMany({
    where: { singletonKey: 1 },
    data: {
      adminMagicLinkSentAt: null,
      adminMagicLinkLastError: errorMessage,
    },
  });
}

export async function consumeAdminMagicLinkToken(token: string) {
  const tokenHash = hashToken(token);
  const now = new Date();

  const matchingToken = await prisma.adminMagicLinkToken.findFirst({
    where: {
      tokenHash,
      usedAt: null,
      expiresAt: { gt: now },
    },
    select: {
      id: true,
      email: true,
    },
  });

  if (!matchingToken) {
    return null;
  }

  const consumeResult = await prisma.adminMagicLinkToken.updateMany({
    where: {
      id: matchingToken.id,
      usedAt: null,
      expiresAt: { gt: now },
    },
    data: {
      usedAt: now,
    },
  });

  if (consumeResult.count !== 1) {
    return null;
  }

  return {
    email: matchingToken.email,
    consumedAt: now.toISOString(),
  };
}

export function isStepFiveComplete(state: StepFiveState) {
  return state.magicLinkSent;
}
