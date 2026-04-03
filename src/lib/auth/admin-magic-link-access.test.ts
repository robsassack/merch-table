import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ADMIN_MAGIC_LINK_ACCESS_ERROR,
  enforceAdminMagicLinkAccess,
} from "@/lib/auth/admin-magic-link-access";

describe("admin magic-link access enforcement", () => {
  it("revokes issued session token when admin access is missing", async () => {
    const revokedTokens: string[] = [];

    const result = await enforceAdminMagicLinkAccess({
      hasAdminAccess: false,
      issuedSessionToken: "token-123",
      revokeIssuedSessionToken: async (token) => {
        revokedTokens.push(token);
      },
    });

    assert.deepEqual(revokedTokens, ["token-123"]);
    assert.deepEqual(result, {
      ok: false,
      status: 403,
      error: ADMIN_MAGIC_LINK_ACCESS_ERROR,
    });
  });

  it("allows access and does not revoke when admin access is present", async () => {
    const revokedTokens: string[] = [];

    const result = await enforceAdminMagicLinkAccess({
      hasAdminAccess: true,
      issuedSessionToken: "token-123",
      revokeIssuedSessionToken: async (token) => {
        revokedTokens.push(token);
      },
    });

    assert.deepEqual(revokedTokens, []);
    assert.deepEqual(result, { ok: true });
  });
});
