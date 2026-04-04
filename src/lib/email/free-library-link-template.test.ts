import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getFreeLibraryLinkEmailHtml } from "@/lib/email/free-library-link-template";

describe("free library link email template", () => {
  it("renders release title and library link", () => {
    const html = getFreeLibraryLinkEmailHtml({
      releaseTitle: "Ocean Waves",
      libraryMagicLinkUrl: "https://example.com/library#token=abc123",
    });

    assert.match(html, /Ocean Waves/);
    assert.match(html, /https:\/\/example\.com\/library#token=abc123/);
    assert.match(html, /Open your library/);
  });

  it("escapes release title HTML", () => {
    const html = getFreeLibraryLinkEmailHtml({
      releaseTitle: "<script>alert('x')</script>",
      libraryMagicLinkUrl: "https://example.com/library#token=abc123",
    });

    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&lt;script&gt;alert\(&#39;x&#39;\)&lt;\/script&gt;/);
  });
});
