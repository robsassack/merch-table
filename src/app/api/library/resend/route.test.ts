import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  getMockEmailSentCount,
  resetMockEmailProviderState,
} from "@/lib/email/provider";

type AnyRecord = Record<string, unknown>;

function patchMethod(target: AnyRecord, name: string, replacement: unknown) {
  const original = target[name];
  target[name] = replacement;
  return () => {
    target[name] = original;
  };
}

function resetInMemoryRateLimitStore() {
  delete (globalThis as AnyRecord)["__merch_table_rate_limit_store__"];
}

describe("POST /api/library/resend", () => {
  const restore: Array<() => void> = [];

  afterEach(() => {
    while (restore.length > 0) {
      const fn = restore.pop();
      fn?.();
    }
    resetMockEmailProviderState();
    delete process.env.EMAIL_PROVIDER;
    delete process.env.SMTP_FROM;
    delete process.env.REDIS_URL;
    resetInMemoryRateLimitStore();
  });

  it("returns generic success even when no matching purchases exist", async () => {
    process.env.DATABASE_URL =
      "postgresql://postgres:postgres@localhost:5432/merch_table_test";
    const { prisma } = await import("@/lib/prisma");

    restore.push(
      patchMethod(
        prisma.storeSettings as unknown as AnyRecord,
        "findFirst",
        async () => ({
          setupComplete: true,
          organizationId: "org-1",
        }),
      ),
    );
    restore.push(
      patchMethod(
        prisma.customer as unknown as AnyRecord,
        "findUnique",
        async () => null,
      ),
    );

    const { POST } = await import("@/app/api/library/resend/route");
    const response = await POST(
      new Request("http://localhost:3000/api/library/resend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "buyer-no-match@example.com" }),
      }),
    );

    assert.equal(response.status, 200);
    const body = (await response.json()) as { ok: boolean };
    assert.equal(body.ok, true);
    assert.equal(getMockEmailSentCount("free_library_link"), 0);
  });

  it("sends a fresh link when matching purchases exist while still returning generic success", async () => {
    process.env.EMAIL_PROVIDER = "mock";
    process.env.SMTP_FROM = "no-reply@example.com";
    process.env.DATABASE_URL =
      "postgresql://postgres:postgres@localhost:5432/merch_table_test";
    const { prisma } = await import("@/lib/prisma");

    restore.push(
      patchMethod(
        prisma.storeSettings as unknown as AnyRecord,
        "findFirst",
        async () => ({
          setupComplete: true,
          organizationId: "org-1",
        }),
      ),
    );
    restore.push(
      patchMethod(
        prisma.setupWizardState as unknown as AnyRecord,
        "findUnique",
        async () => ({
          smtpFromEmail: "no-reply@example.com",
        }),
      ),
    );
    restore.push(
      patchMethod(
        prisma.customer as unknown as AnyRecord,
        "findUnique",
        async () => ({
          id: "customer-1",
        }),
      ),
    );
    restore.push(
      patchMethod(
        prisma.downloadEntitlement as unknown as AnyRecord,
        "findFirst",
        async () => ({
          release: {
            title: "My Release",
          },
        }),
      ),
    );
    restore.push(
      patchMethod(
        prisma.buyerLibraryToken as unknown as AnyRecord,
        "create",
        async () => ({
          token: "fresh-library-token",
        }),
      ),
    );

    const { POST } = await import("@/app/api/library/resend/route");
    const response = await POST(
      new Request("http://localhost:3000/api/library/resend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "buyer-has-purchase@example.com" }),
      }),
    );

    assert.equal(response.status, 200);
    const body = (await response.json()) as { ok: boolean };
    assert.equal(body.ok, true);
    assert.equal(getMockEmailSentCount("free_library_link"), 1);
  });

  it("returns 429 with retry-after when resend requests exceed the rate limit", async () => {
    process.env.DATABASE_URL =
      "postgresql://postgres:postgres@localhost:5432/merch_table_test";
    delete process.env.REDIS_URL;
    resetInMemoryRateLimitStore();
    const { prisma } = await import("@/lib/prisma");

    restore.push(
      patchMethod(
        prisma.storeSettings as unknown as AnyRecord,
        "findFirst",
        async () => ({
          setupComplete: false,
          organizationId: "org-1",
        }),
      ),
    );

    const { POST } = await import("@/app/api/library/resend/route");

    let limitedResponse: Response | null = null;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await POST(
        new Request("http://localhost:3000/api/library/resend", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: "buyer-rate-limit@example.com" }),
        }),
      );
      if (response.status === 429) {
        limitedResponse = response;
        break;
      }
    }

    assert.ok(limitedResponse);
    assert.equal(limitedResponse.status, 429);

    const retryAfterHeader = limitedResponse.headers.get("retry-after");
    assert.ok(retryAfterHeader);
    assert.ok(Number(retryAfterHeader) >= 1);
  });
});
