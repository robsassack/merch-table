import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseCookies } from "better-call";

import {
  parseSignedCookieValue,
  serializeSignedSessionTokenCookie,
} from "@/lib/auth/better-auth-session-cookie";

describe("better auth session cookie", () => {
  it("serializes a signed session token cookie", async () => {
    const token = "12345678901234567890123456789012";
    const header = await serializeSignedSessionTokenCookie({
      token,
      secret: "local-test-secret-value",
      cookie: {
        name: "better-auth.session_token",
        attributes: {
          path: "/",
          httpOnly: true,
          sameSite: "lax",
        },
      },
    });

    const cookiePair = header.split(";", 1)[0] ?? "";
    const parsed = parseCookies(cookiePair);
    const cookieValue = parsed.get("better-auth.session_token");
    assert.ok(cookieValue);

    const signed = parseSignedCookieValue(cookieValue);
    assert.ok(signed);
    assert.equal(signed?.signedValue, token);
  });

  it("rejects unsigned session token cookie values", () => {
    assert.equal(parseSignedCookieValue(null), null);
    assert.equal(
      parseSignedCookieValue("12345678901234567890123456789012"),
      null,
    );
  });
});
