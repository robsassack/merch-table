type FreeLibraryLinkTemplateInput = {
  releaseTitle: string;
  libraryMagicLinkUrl: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function getFreeLibraryLinkEmailHtml({
  releaseTitle,
  libraryMagicLinkUrl,
}: FreeLibraryLinkTemplateInput) {
  const safeReleaseTitle = escapeHtml(releaseTitle);

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <h1 style="font-size: 18px; margin: 0 0 12px;">Your Library Link</h1>
      <p style="margin: 0 0 12px;">
        You unlocked <strong>${safeReleaseTitle}</strong> on Merch Table.
      </p>
      <p style="margin: 0 0 12px;">
        Use this secure link to open your library:
      </p>
      <p style="margin: 0 0 16px;">
        <a href="${libraryMagicLinkUrl}" style="color: #0f62fe; text-decoration: underline;">
          Open your library
        </a>
      </p>
      <p style="margin: 0; color: #4b5563;">
        Keep this email so you can return to your downloads later.
      </p>
    </div>
  `;
}
