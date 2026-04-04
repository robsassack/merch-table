import { getFreeLibraryLinkEmailHtml } from "@/lib/email/free-library-link-template";
import { readFromEmailAddress } from "@/lib/email/from-address";
import { sendEmail } from "@/lib/email/provider";

export async function sendFreeLibraryLinkEmail(input: {
  email: string;
  releaseTitle: string;
  libraryMagicLinkUrl: string;
}) {
  const fromEmail = await readFromEmailAddress();

  await sendEmail({
    templateType: "free_library_link",
    from: fromEmail,
    to: input.email,
    subject: "Your Merch Table library link",
    html: getFreeLibraryLinkEmailHtml({
      releaseTitle: input.releaseTitle,
      libraryMagicLinkUrl: input.libraryMagicLinkUrl,
    }),
  });
}
