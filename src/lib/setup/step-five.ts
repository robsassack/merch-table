import { z } from "zod";

import { sendAdminMagicLink } from "@/lib/auth/admin-magic-link";
import { prisma } from "@/lib/prisma";

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
    },
  });

  if (!state || !state.id || !state.adminEmail || !state.smtpHost) {
    throw new Error("Complete SMTP setup and admin email before sending magic link.");
  }

  const result = await sendAdminMagicLink(state.adminEmail);

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
    adminEmail: result.adminEmail,
    expiresAt: result.expiresAt,
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

export function isStepFiveComplete(state: StepFiveState) {
  return state.magicLinkSent;
}
