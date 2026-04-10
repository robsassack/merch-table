import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { toSafeMarkdownHref } from "@/lib/content/markdown";

describe("toSafeMarkdownHref", () => {
  it("accepts safe absolute protocols", () => {
    assert.equal(toSafeMarkdownHref("https://example.com/releases"), "https://example.com/releases");
    assert.equal(toSafeMarkdownHref("http://example.com"), "http://example.com/");
    assert.equal(toSafeMarkdownHref("mailto:hello@example.com"), "mailto:hello@example.com");
  });

  it("accepts safe relative references", () => {
    assert.equal(toSafeMarkdownHref("/release/abc"), "/release/abc");
    assert.equal(toSafeMarkdownHref("#credits"), "#credits");
  });

  it("rejects unsafe protocols", () => {
    assert.equal(toSafeMarkdownHref("javascript:alert(1)"), null);
    assert.equal(toSafeMarkdownHref("data:text/html,<b>x</b>"), null);
    assert.equal(toSafeMarkdownHref("file:///etc/passwd"), null);
    assert.equal(toSafeMarkdownHref("//example.com"), null);
  });
});
