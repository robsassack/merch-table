import nodemailer from "nodemailer";
import { z } from "zod";

import { decryptSecret, encryptSecret } from "@/lib/crypto/secret-box";
import { getSetupTestEmailHtml } from "@/lib/email/setup-test-template";
import { prisma } from "@/lib/prisma";

const smtpPortMin = 1;
const smtpPortMax = 65535;

export const stepTwoSchema = z.object({
  smtpProviderPreset: z.string().trim().min(1).default("custom"),
  smtpHost: z.string().trim().min(1, "SMTP host is required.").max(255),
  smtpPort: z.number().int().min(smtpPortMin).max(smtpPortMax),
  smtpUsername: z.string().trim().min(1, "SMTP username is required.").max(255),
  smtpPassword: z
    .string()
    .trim()
    .max(255)
    .optional(),
  smtpSecure: z.boolean().default(false),
  smtpFromEmail: z.email("Enter a valid sender email.").max(320),
  smtpTestRecipient: z.email("Enter a valid test recipient email.").max(320),
});

export type StepTwoInput = z.infer<typeof stepTwoSchema>;

export type StepTwoState = {
  smtpProviderPreset: string;
  smtpHost: string;
  smtpPort: number;
  smtpUsername: string;
  smtpSecure: boolean;
  smtpFromEmail: string;
  smtpTestRecipient: string;
  hasPassword: boolean;
  testPassed: boolean;
  lastTestedAt: string | null;
  lastTestError: string | null;
};

const defaultState: StepTwoState = {
  smtpProviderPreset: "custom",
  smtpHost: "",
  smtpPort: 587,
  smtpUsername: "",
  smtpSecure: false,
  smtpFromEmail: "",
  smtpTestRecipient: "",
  hasPassword: false,
  testPassed: false,
  lastTestedAt: null,
  lastTestError: null,
};

export async function getStepTwoState(contactEmail?: string): Promise<StepTwoState> {
  const state = await prisma.setupWizardState.findUnique({
    where: { singletonKey: 1 },
    select: {
      smtpHost: true,
      smtpProviderPreset: true,
      smtpPort: true,
      smtpUsername: true,
      smtpPassword: true,
      smtpSecure: true,
      smtpFromEmail: true,
      smtpTestRecipient: true,
      smtpTestPassedAt: true,
      smtpLastTestError: true,
    },
  });

  if (!state) {
    return {
      ...defaultState,
      smtpTestRecipient: contactEmail ?? "",
    };
  }

  return {
    smtpHost: state.smtpHost ?? "",
    smtpProviderPreset: state.smtpProviderPreset || "custom",
    smtpPort: state.smtpPort ?? 587,
    smtpUsername: state.smtpUsername ?? "",
    smtpSecure: state.smtpSecure,
    smtpFromEmail: state.smtpFromEmail ?? "",
    smtpTestRecipient: state.smtpTestRecipient ?? contactEmail ?? "",
    hasPassword: Boolean(state.smtpPassword),
    testPassed: Boolean(state.smtpTestPassedAt),
    lastTestedAt: state.smtpTestPassedAt?.toISOString() ?? null,
    lastTestError: state.smtpLastTestError ?? null,
  };
}

export async function saveStepTwoState(input: StepTwoInput) {
  const parsed = stepTwoSchema.parse(input);
  const existing = await prisma.setupWizardState.findUnique({
    where: { singletonKey: 1 },
    select: { smtpPassword: true },
  });

  const nextPassword =
    parsed.smtpPassword && parsed.smtpPassword.length > 0
      ? parsed.smtpPassword
      : decryptSecret(existing?.smtpPassword) ?? null;

  return prisma.setupWizardState.upsert({
    where: { singletonKey: 1 },
    create: {
      singletonKey: 1,
      smtpHost: parsed.smtpHost,
      smtpProviderPreset: parsed.smtpProviderPreset,
      smtpPort: parsed.smtpPort,
      smtpUsername: parsed.smtpUsername,
      smtpPassword: encryptSecret(nextPassword),
      smtpSecure: parsed.smtpSecure,
      smtpFromEmail: parsed.smtpFromEmail,
      smtpTestRecipient: parsed.smtpTestRecipient,
      smtpTestPassedAt: null,
      smtpLastTestError: null,
    },
    update: {
      smtpHost: parsed.smtpHost,
      smtpProviderPreset: parsed.smtpProviderPreset,
      smtpPort: parsed.smtpPort,
      smtpUsername: parsed.smtpUsername,
      smtpPassword: encryptSecret(nextPassword),
      smtpSecure: parsed.smtpSecure,
      smtpFromEmail: parsed.smtpFromEmail,
      smtpTestRecipient: parsed.smtpTestRecipient,
      smtpTestPassedAt: null,
      smtpLastTestError: null,
    },
  });
}

export async function sendSetupTestEmail() {
  const state = await prisma.setupWizardState.findUnique({
    where: { singletonKey: 1 },
    select: {
      id: true,
      smtpHost: true,
      smtpPort: true,
      smtpUsername: true,
      smtpPassword: true,
      smtpSecure: true,
      smtpFromEmail: true,
      smtpTestRecipient: true,
    },
  });

  if (
    !state ||
    !state.smtpHost ||
    !state.smtpPort ||
    !state.smtpUsername ||
    !state.smtpPassword ||
    !state.smtpFromEmail ||
    !state.smtpTestRecipient
  ) {
    throw new Error("Save complete SMTP settings before sending a test email.");
  }

  const smtpPassword = decryptSecret(state.smtpPassword);
  if (!smtpPassword) {
    throw new Error("Save complete SMTP settings before sending a test email.");
  }

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

  await transporter.sendMail({
    from: state.smtpFromEmail,
    to: state.smtpTestRecipient,
    subject: "Merch Table setup test email",
    html: getSetupTestEmailHtml(),
  });

  const now = new Date();

  await prisma.setupWizardState.update({
    where: { id: state.id },
    data: {
      smtpTestPassedAt: now,
      smtpLastTestError: null,
    },
  });

  return {
    sentAt: now.toISOString(),
    recipient: state.smtpTestRecipient,
  };
}

export async function markSetupTestEmailFailed(errorMessage: string) {
  await prisma.setupWizardState.updateMany({
    where: { singletonKey: 1 },
    data: {
      smtpTestPassedAt: null,
      smtpLastTestError: errorMessage,
    },
  });
}

export function isStepTwoComplete(state: StepTwoState) {
  return (
    state.testPassed &&
    state.hasPassword &&
    state.smtpHost.trim().length > 0 &&
    state.smtpUsername.trim().length > 0 &&
    state.smtpFromEmail.trim().length > 0 &&
    state.smtpTestRecipient.trim().length > 0
  );
}
