import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import Stripe from "stripe";

type AnyRecord = Record<string, unknown>;

function patchMethod(target: AnyRecord, name: string, replacement: unknown) {
  const original = target[name];
  target[name] = replacement;
  return () => {
    target[name] = original;
  };
}

describe("POST /api/checkout/session", () => {
  const restore: Array<() => void> = [];

  afterEach(() => {
    while (restore.length > 0) {
      const fn = restore.pop();
      fn?.();
    }
    delete process.env.STRIPE_SECRET_KEY;
  });

  it("requires confirmation when the provided email already owns the release", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
    process.env.DATABASE_URL ??=
      "postgresql://postgres:postgres@localhost:5432/merch_table_test";

    const { prisma } = await import("@/lib/prisma");

    restore.push(
      patchMethod(
        prisma.setupWizardState as unknown as AnyRecord,
        "findUnique",
        async () => null,
      ),
    );
    restore.push(
      patchMethod(
        prisma.storeSettings as unknown as AnyRecord,
        "findFirst",
        async () => ({
          setupComplete: true,
          organizationId: "org-1",
          currency: "USD",
        }),
      ),
    );
    restore.push(
      patchMethod(prisma.release as unknown as AnyRecord, "findFirst", async () => ({
        id: "release-1",
        title: "Paid Release",
        pricingMode: "FIXED",
        priceCents: null,
        fixedPriceCents: 1200,
        minimumPriceCents: null,
      })),
    );
    restore.push(
      patchMethod(
        prisma.downloadEntitlement as unknown as AnyRecord,
        "findFirst",
        async () => ({ id: "entitlement-1" }),
      ),
    );

    const { POST } = await import("@/app/api/checkout/session/route");

    const response = await POST(
      new Request("http://localhost:3000/api/checkout/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          releaseId: "release-1",
          email: "buyer@example.com",
          successUrl: "http://localhost:3000/success",
          cancelUrl: "http://localhost:3000/cancel",
        }),
      }),
    );

    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      ok: false,
      code: "ALREADY_OWNED_CONFIRMATION_REQUIRED",
      error:
        "This email already owns this release. Continue anyway to create a new purchase?",
    });
  });

  it("allows checkout when already-owned confirmation is provided", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
    process.env.DATABASE_URL ??=
      "postgresql://postgres:postgres@localhost:5432/merch_table_test";

    const { prisma } = await import("@/lib/prisma");
    const probeStripe = new Stripe("sk_test_dummy");
    const sessionsPrototype = Object.getPrototypeOf(probeStripe.checkout.sessions);

    restore.push(
      patchMethod(
        prisma.setupWizardState as unknown as AnyRecord,
        "findUnique",
        async () => null,
      ),
    );
    restore.push(
      patchMethod(
        prisma.storeSettings as unknown as AnyRecord,
        "findFirst",
        async () => ({
          setupComplete: true,
          organizationId: "org-1",
          currency: "USD",
        }),
      ),
    );
    restore.push(
      patchMethod(prisma.release as unknown as AnyRecord, "findFirst", async () => ({
        id: "release-1",
        title: "Paid Release",
        pricingMode: "FIXED",
        priceCents: null,
        fixedPriceCents: 1200,
        minimumPriceCents: null,
      })),
    );
    restore.push(
      patchMethod(
        prisma.downloadEntitlement as unknown as AnyRecord,
        "findFirst",
        async () => ({ id: "entitlement-1" }),
      ),
    );
    restore.push(
      patchMethod(
        sessionsPrototype as AnyRecord,
        "create",
        async () => ({
          id: "cs_test_1",
          url: "https://checkout.stripe.test/session/1",
        }),
      ),
    );

    const { POST } = await import("@/app/api/checkout/session/route");

    const response = await POST(
      new Request("http://localhost:3000/api/checkout/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          releaseId: "release-1",
          email: "buyer@example.com",
          confirmAlreadyOwned: true,
          successUrl: "http://localhost:3000/success",
          cancelUrl: "http://localhost:3000/cancel",
        }),
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      checkoutSessionId: "cs_test_1",
      checkoutUrl: "https://checkout.stripe.test/session/1",
    });
  });
});
