import crypto from "node:crypto";

import { prisma } from "@/lib/prisma";

const SETUP_TOKEN_TTL_MINUTES = 30;
const DEFAULT_APP_BASE_URL = "http://localhost:3000";

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateToken() {
  return crypto.randomBytes(24).toString("base64url");
}

function getSetupLink(token: string) {
  const appBaseUrl = process.env.APP_BASE_URL ?? DEFAULT_APP_BASE_URL;
  const normalizedBaseUrl = appBaseUrl.endsWith("/")
    ? appBaseUrl.slice(0, -1)
    : appBaseUrl;

  return `${normalizedBaseUrl}/setup?token=${encodeURIComponent(token)}`;
}

function logSetupToken(token: string, expiresAt: Date) {
  console.log(
    `[bootstrap] SETUP LINK: ${getSetupLink(token)} (expires ${expiresAt.toISOString()})`,
  );
  console.log(`[bootstrap] SETUP TOKEN: ${token}`);
}

async function createSetupToken(now: Date) {
  const token = generateToken();
  const expiresAt = new Date(now.getTime() + SETUP_TOKEN_TTL_MINUTES * 60_000);

  await prisma.setupToken.create({
    data: {
      token,
      tokenHash: hashToken(token),
      expiresAt,
    },
  });

  return { token, expiresAt };
}

export async function ensureBootstrapSetupTokenOnStartup() {
  const storeSettings = await prisma.storeSettings.findFirst({
    select: { setupComplete: true, storeStatus: true },
    orderBy: { createdAt: "asc" },
  });

  const isSetupPending =
    (storeSettings?.setupComplete ?? false) === false &&
    (storeSettings?.storeStatus ?? "SETUP") === "SETUP";

  if (!isSetupPending) {
    return;
  }

  const now = new Date();

  const activeToken = await prisma.setupToken.findFirst({
    where: {
      consumedAt: null,
      expiresAt: { gt: now },
    },
    select: { id: true, token: true, expiresAt: true },
  });

  if (activeToken) {
    if (activeToken.token) {
      logSetupToken(activeToken.token, activeToken.expiresAt);
      return;
    }

    // Older rows may not have plaintext token persisted.
    // Consume old token and mint a replacement so startup can re-print reliably.
    await prisma.setupToken.update({
      where: { id: activeToken.id },
      data: { consumedAt: now },
    });

    const replacement = await createSetupToken(now);
    logSetupToken(replacement.token, replacement.expiresAt);
    return;
  }

  const created = await createSetupToken(now);
  logSetupToken(created.token, created.expiresAt);
}

export async function claimBootstrapSetupToken(token: string) {
  const tokenHash = hashToken(token);
  const now = new Date();

  const claimResult = await prisma.setupToken.updateMany({
    where: {
      tokenHash,
      consumedAt: null,
      expiresAt: { gt: now },
    },
    data: {
      consumedAt: now,
    },
  });

  return claimResult.count === 1;
}
