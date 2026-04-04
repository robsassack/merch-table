import nodemailer from "nodemailer";

import { decryptSecret } from "@/lib/crypto/secret-box";
import { getPurchaseConfirmationEmailHtml } from "@/lib/email/purchase-confirmation-template";
import { prisma } from "@/lib/prisma";

type SmtpConfig = {
  smtpHost: string;
  smtpPort: number;
  smtpUsername: string;
  smtpPassword: string;
  smtpSecure: boolean;
  smtpFromEmail: string;
};

function formatAmountPaid(cents: number, currency: string) {
  const normalizedCurrency = currency.trim().toUpperCase();
  const amount = cents / 100;

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: normalizedCurrency,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${normalizedCurrency}`;
  }
}

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

export async function sendPurchaseConfirmationEmail(input: {
  email: string;
  releaseTitle: string;
  libraryMagicLinkUrl: string;
  amountPaidCents: number;
  currency: string;
}) {
  const smtp = await getSmtpConfig();
  const amountPaidDisplay = formatAmountPaid(input.amountPaidCents, input.currency);

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

  await transporter.sendMail({
    from: smtp.smtpFromEmail,
    to: input.email,
    subject: "Your Merch Table purchase confirmation",
    html: getPurchaseConfirmationEmailHtml({
      releaseTitle: input.releaseTitle,
      libraryMagicLinkUrl: input.libraryMagicLinkUrl,
      amountPaidDisplay,
    }),
  });
}
