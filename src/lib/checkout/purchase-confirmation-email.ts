import { getPurchaseConfirmationEmailHtml } from "@/lib/email/purchase-confirmation-template";
import { readFromEmailAddress } from "@/lib/email/from-address";
import { sendEmail } from "@/lib/email/provider";

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

export async function sendPurchaseConfirmationEmail(input: {
  email: string;
  releaseTitle: string;
  libraryMagicLinkUrl: string;
  amountPaidCents: number;
  currency: string;
}) {
  const fromEmail = await readFromEmailAddress();
  const amountPaidDisplay = formatAmountPaid(input.amountPaidCents, input.currency);

  await sendEmail({
    templateType: "purchase_confirmation",
    from: fromEmail,
    to: input.email,
    subject: "Your Merch Table purchase confirmation",
    html: getPurchaseConfirmationEmailHtml({
      releaseTitle: input.releaseTitle,
      libraryMagicLinkUrl: input.libraryMagicLinkUrl,
      amountPaidDisplay,
    }),
  });
}
