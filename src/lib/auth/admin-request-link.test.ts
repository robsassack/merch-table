import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  GENERIC_ADMIN_MAGIC_LINK_MESSAGE,
  resolveAdminRequestLinkPlan,
} from "@/lib/auth/admin-request-link";

describe("admin request-link plan", () => {
  it("returns generic message and does not send when rate-limited", () => {
    const plan = resolveAdminRequestLinkPlan({
      emailRateLimited: true,
      authorized: true,
    });

    assert.equal(plan.shouldSendMagicLink, false);
    assert.equal(plan.message, GENERIC_ADMIN_MAGIC_LINK_MESSAGE);
  });

  it("returns generic message and does not send when unauthorized", () => {
    const plan = resolveAdminRequestLinkPlan({
      emailRateLimited: false,
      authorized: false,
    });

    assert.equal(plan.shouldSendMagicLink, false);
    assert.equal(plan.message, GENERIC_ADMIN_MAGIC_LINK_MESSAGE);
  });

  it("sends only when authorized and not rate-limited", () => {
    const plan = resolveAdminRequestLinkPlan({
      emailRateLimited: false,
      authorized: true,
    });

    assert.equal(plan.shouldSendMagicLink, true);
    assert.equal(plan.message, GENERIC_ADMIN_MAGIC_LINK_MESSAGE);
  });
});
