type AdminMagicLinkTemplateInput = {
  magicLinkUrl: string;
  expiresInMinutes: number;
};

export function getAdminMagicLinkEmailHtml({
  magicLinkUrl,
  expiresInMinutes,
}: AdminMagicLinkTemplateInput) {
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <h1 style="font-size: 18px; margin: 0 0 12px;">Your Admin Sign-In Link</h1>
      <p style="margin: 0 0 12px;">
        Click the secure link below to sign in to your Merch Table admin account.
      </p>
      <p style="margin: 0 0 16px;">
        <a href="${magicLinkUrl}" style="color: #0f62fe; text-decoration: underline;">
          Sign in to admin
        </a>
      </p>
      <p style="margin: 0; color: #4b5563;">
        This one-time link expires in ${expiresInMinutes} minutes.
      </p>
    </div>
  `;
}
