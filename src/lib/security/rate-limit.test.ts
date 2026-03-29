import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { enforceRateLimit } from "@/lib/security/rate-limit";

describe("rate limit", () => {
  it("scopes limits by custom session key", async () => {
    const request = new Request("http://localhost/api/admin/upload/upload-url");
    const policy = {
      id: `test-upload-url-${Date.now()}`,
      maxRequests: 1,
      windowMs: 60_000,
    };

    const first = await enforceRateLimit(request, policy, {
      key: "admin-session:a",
    });
    assert.equal(first, null);

    const second = await enforceRateLimit(request, policy, {
      key: "admin-session:a",
    });
    assert.ok(second);
    assert.equal(second?.status, 429);
    assert.ok(second?.headers.get("retry-after"));

    const third = await enforceRateLimit(request, policy, {
      key: "admin-session:b",
    });
    assert.equal(third, null);
  });
});
