import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getPurchaseConfirmationEmailHtml } from "@/lib/email/purchase-confirmation-template";

describe("purchase confirmation email template", () => {
  it("renders release title, amount paid, and library link", () => {
    const html = getPurchaseConfirmationEmailHtml({
      releaseTitle: "Skyline EP",
      libraryMagicLinkUrl: "https://example.com/library#token=def456",
      amountPaidDisplay: "$12.00",
    });

    assert.match(html, /Skyline EP/);
    assert.match(html, /\$12\.00/);
    assert.match(html, /https:\/\/example\.com\/library#token=def456/);
    assert.match(html, /Open your library/);
  });

  it("escapes dynamic text values", () => {
    const html = getPurchaseConfirmationEmailHtml({
      releaseTitle: "<b>Unsafe</b>",
      libraryMagicLinkUrl: "https://example.com/library#token=def456",
      amountPaidDisplay: "<img src=x onerror=alert(1)>",
    });

    assert.doesNotMatch(html, /<b>Unsafe<\/b>/);
    assert.match(html, /&lt;b&gt;Unsafe&lt;\/b&gt;/);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  });
});
