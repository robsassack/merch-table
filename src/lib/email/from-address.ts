import { prisma } from "@/lib/prisma";

export async function readFromEmailAddress() {
  const state = await prisma.setupWizardState.findUnique({
    where: { singletonKey: 1 },
    select: { smtpFromEmail: true },
  });

  const configured =
    state?.smtpFromEmail?.trim() ||
    process.env.RESEND_FROM_EMAIL?.trim() ||
    process.env.SMTP_FROM?.trim() ||
    "";

  if (!configured) {
    throw new Error("Email sender address is not configured.");
  }

  return configured;
}
