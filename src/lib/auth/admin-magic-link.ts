import { getAdminMagicLinkEmailHtml } from "@/lib/email/admin-magic-link-template";
import { readFromEmailAddress } from "@/lib/email/from-address";
import { sendEmail } from "@/lib/email/provider";

const MAGIC_LINK_EXPIRY_MINUTES = 30;
const DEFAULT_APP_BASE_URL = "http://localhost:3000";

function getMagicLinkUrl(token: string) {
  const appBaseUrl = process.env.APP_BASE_URL ?? DEFAULT_APP_BASE_URL;
  const normalized = appBaseUrl.endsWith("/")
    ? appBaseUrl.slice(0, -1)
    : appBaseUrl;

  // Keep token out of server logs and referrers by using URL fragments.
  return `${normalized}/admin/auth/magic-link#token=${encodeURIComponent(token)}`;
}

export function getAdminMagicLinkExpiryMinutes() {
  return MAGIC_LINK_EXPIRY_MINUTES;
}

export async function sendAdminMagicLinkEmail(input: {
  email: string;
  token: string;
}) {
  const fromEmail = await readFromEmailAddress();
  const magicLinkUrl = getMagicLinkUrl(input.token);

  await sendEmail({
    templateType: "admin_magic_link",
    from: fromEmail,
    to: input.email,
    subject: "Your Merch Table admin sign-in link",
    html: getAdminMagicLinkEmailHtml({
      magicLinkUrl,
      expiresInMinutes: MAGIC_LINK_EXPIRY_MINUTES,
    }),
  });

  return {
    sentAt: new Date().toISOString(),
    adminEmail: input.email,
    expiresInMinutes: MAGIC_LINK_EXPIRY_MINUTES,
  };
}
