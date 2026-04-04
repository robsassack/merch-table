type PurchaseConfirmationTemplateInput = {
  releaseTitle: string;
  libraryMagicLinkUrl: string;
  amountPaidDisplay: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function getPurchaseConfirmationEmailHtml({
  releaseTitle,
  libraryMagicLinkUrl,
  amountPaidDisplay,
}: PurchaseConfirmationTemplateInput) {
  const safeReleaseTitle = escapeHtml(releaseTitle);
  const safeLibraryMagicLinkUrl = escapeHtml(libraryMagicLinkUrl);
  const safeAmountPaidDisplay = escapeHtml(amountPaidDisplay);

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <h1 style="font-size: 18px; margin: 0 0 12px;">Thanks For Your Purchase</h1>
      <p style="margin: 0 0 12px;">
        You purchased <strong>${safeReleaseTitle}</strong> for <strong>${safeAmountPaidDisplay}</strong>.
      </p>
      <p style="margin: 0 0 12px;">
        Use this secure link to open your library:
      </p>
      <p style="margin: 0 0 16px;">
        <a href="${safeLibraryMagicLinkUrl}" style="color: #0f62fe; text-decoration: underline;">
          Open your library
        </a>
      </p>
      <p style="margin: 0; color: #4b5563;">
        Keep this email so you can return to your downloads later.
      </p>
    </div>
  `;
}
