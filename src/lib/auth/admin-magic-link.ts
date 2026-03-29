import crypto from "node:crypto";

import nodemailer from "nodemailer";

import { decryptSecret } from "@/lib/crypto/secret-box";
import { getAdminMagicLinkEmailHtml } from "@/lib/email/admin-magic-link-template";
import { prisma } from "@/lib/prisma";

const MAGIC_LINK_EXPIRY_MINUTES = 30;
const DEFAULT_APP_BASE_URL = "http://localhost:3000";

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateToken() {
  return crypto.randomBytes(24).toString("base64url");
}

function getMagicLinkUrl(token: string) {
  const appBaseUrl = process.env.APP_BASE_URL ?? DEFAULT_APP_BASE_URL;
  const normalized = appBaseUrl.endsWith("/")
    ? appBaseUrl.slice(0, -1)
    : appBaseUrl;

  // Keep token out of server logs and referrers by using URL fragments.
  return `${normalized}/admin/auth/magic-link#token=${encodeURIComponent(token)}`;
}

type SmtpConfig = {
  smtpHost: string;
  smtpPort: number;
  smtpUsername: string;
  smtpPassword: string;
  smtpSecure: boolean;
  smtpFromEmail: string;
};

async function getSmtpConfig(): Promise<SmtpConfig> {
  const state = await prisma.setupWizardState.findUnique({
    where: { singletonKey: 1 },
    select: {
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
    !state.smtpHost ||
    !state.smtpPort ||
    !state.smtpUsername ||
    !state.smtpPassword ||
    !state.smtpFromEmail
  ) {
    throw new Error("Email config is incomplete.");
  }

  const smtpPassword = decryptSecret(state.smtpPassword);
  if (!smtpPassword) {
    throw new Error("Email config is incomplete.");
  }

  return {
    smtpHost: state.smtpHost,
    smtpPort: state.smtpPort,
    smtpUsername: state.smtpUsername,
    smtpPassword,
    smtpSecure: state.smtpSecure,
    smtpFromEmail: state.smtpFromEmail,
  };
}

export async function sendAdminMagicLink(email: string) {
  const smtp = await getSmtpConfig();
  const token = generateToken();
  const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_MINUTES * 60_000);

  await prisma.adminMagicLinkToken.create({
    data: {
      email,
      tokenHash: hashToken(token),
      expiresAt,
    },
  });

  const transporter = nodemailer.createTransport({
    host: smtp.smtpHost,
    port: smtp.smtpPort,
    secure: smtp.smtpSecure,
    auth: {
      user: smtp.smtpUsername,
      pass: smtp.smtpPassword,
    },
  });

  await transporter.verify();

  const magicLinkUrl = getMagicLinkUrl(token);
  await transporter.sendMail({
    from: smtp.smtpFromEmail,
    to: email,
    subject: "Your Merch Table admin sign-in link",
    html: getAdminMagicLinkEmailHtml({
      magicLinkUrl,
      expiresInMinutes: MAGIC_LINK_EXPIRY_MINUTES,
    }),
  });

  return {
    sentAt: new Date().toISOString(),
    adminEmail: email,
    expiresAt: expiresAt.toISOString(),
  };
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
