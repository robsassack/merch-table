import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  createOwnedReleaseHintCookieValue,
  hasOwnedReleaseHintFromCookieStore,
  parseOwnedReleaseHintCookieValue,
} from "@/lib/checkout/owned-release-hint-cookie";

describe("owned release hint cookie", () => {
  const originalDateNow = Date.now;

  afterEach(() => {
    delete process.env.AUTH_SECRET;
    Date.now = originalDateNow;
  });

  it("creates and validates a signed cookie payload", () => {
    process.env.AUTH_SECRET = "test-secret";
    Date.now = () => 1_700_000_000_000;

    const cookie = createOwnedReleaseHintCookieValue([
      "release-1",
      "release-1",
      "release-2",
    ]);
    assert.ok(cookie);

    const parsed = parseOwnedReleaseHintCookieValue(cookie);
    assert.deepEqual(parsed, ["release-1", "release-2"]);
  });

  it("rejects expired cookie payloads", () => {
    process.env.AUTH_SECRET = "test-secret";
    Date.now = () => 1_700_000_000_000;
    const cookie = createOwnedReleaseHintCookieValue(["release-1"]);
    assert.ok(cookie);

    Date.now = () => 1_800_000_000_000;
    assert.equal(parseOwnedReleaseHintCookieValue(cookie), null);
  });

  it("reads owned release hints from cookie-store-like object", () => {
    process.env.AUTH_SECRET = "test-secret";
    Date.now = () => 1_700_000_000_000;
    const cookie = createOwnedReleaseHintCookieValue(["release-1"]);
    assert.ok(cookie);

    const cookieStore = {
      get(name: string) {
        if (name !== "mt_owned_release_hint") {
          return undefined;
        }
        return { value: cookie as string };
      },
    };

    assert.equal(hasOwnedReleaseHintFromCookieStore(cookieStore, "release-1"), true);
    assert.equal(hasOwnedReleaseHintFromCookieStore(cookieStore, "release-2"), false);
  });
});
