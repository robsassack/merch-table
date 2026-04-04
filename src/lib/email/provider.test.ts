import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  getLastEmail,
  getMockEmailCounters,
  getMockEmailSentCount,
  resetMockEmailProviderState,
  sendEmail,
} from "@/lib/email/provider";

describe("mock email provider", () => {
  afterEach(() => {
    resetMockEmailProviderState();
    delete process.env.EMAIL_PROVIDER;
  });

  it("increments counters by template type and stores the last email", async () => {
    process.env.EMAIL_PROVIDER = "mock";

    await sendEmail({
      templateType: "purchase_confirmation",
      from: "no-reply@example.com",
      to: "buyer@example.com",
      subject: "Purchase",
      html: "<p>Thanks</p>",
    });

    await sendEmail({
      templateType: "free_library_link",
      from: "no-reply@example.com",
      to: "fan@example.com",
      subject: "Library",
      html: "<p>Link</p>",
    });

    assert.equal(getMockEmailSentCount("purchase_confirmation"), 1);
    assert.equal(getMockEmailSentCount("free_library_link"), 1);
    assert.deepEqual(getMockEmailCounters(), {
      purchase_confirmation: 1,
      free_library_link: 1,
      admin_magic_link: 0,
      setup_test: 0,
    });

    const lastEmail = getLastEmail();
    assert.ok(lastEmail);
    assert.equal(lastEmail.templateType, "free_library_link");
    assert.equal(lastEmail.to, "fan@example.com");
    assert.match(lastEmail.messageId, /^mock-email-\d{6}$/);
  });

  it("resets counters and clears the last email", async () => {
    process.env.EMAIL_PROVIDER = "mock";

    await sendEmail({
      templateType: "setup_test",
      from: "no-reply@example.com",
      to: "admin@example.com",
      subject: "Setup test",
      html: "<p>Test</p>",
    });

    resetMockEmailProviderState();

    assert.equal(getMockEmailSentCount("setup_test"), 0);
    assert.equal(getLastEmail(), null);
  });
});
