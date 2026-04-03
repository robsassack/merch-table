import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getSessionWithStrictLookup,
  type GetSessionInput,
} from "@/lib/auth/admin-session-lookup";

describe("admin session lookup", () => {
  it("normalizes cookie headers and disables cookie cache", async () => {
    const headers = new Headers();
    headers.set(
      "cookie",
      "a=1; better-auth.session_token=old-token; b=2; better-auth.session_token=new-token",
    );

    const captured: GetSessionInput[] = [];

    const session = await getSessionWithStrictLookup({
      headers,
      getSession: async (input: GetSessionInput) => {
        captured.push(input);
        return { ok: true };
      },
    });

    assert.deepEqual(session, { ok: true });
    const received = captured[0];
    assert.ok(received);
    if (!received) {
      throw new Error("Expected lookup call to be captured.");
    }

    assert.equal(received.query?.disableCookieCache, true);
    assert.equal(
      received.headers.get("cookie"),
      "a=1; b=2; better-auth.session_token=new-token",
    );
  });
});
