import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import Stripe from "stripe";

import {
  getLastEmail,
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

describe("POST /api/webhooks/stripe", () => {
  const restore: Array<() => void> = [];

  afterEach(() => {
    while (restore.length > 0) {
      const fn = restore.pop();
      fn?.();
    }
    resetMockEmailProviderState();
    delete process.env.EMAIL_PROVIDER;
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  it("finalizes checkout and marks purchase confirmation email as SENT with mock provider", async () => {
    process.env.EMAIL_PROVIDER = "mock";
    process.env.SMTP_FROM = "no-reply@example.com";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    process.env.DATABASE_URL ??=
      "postgresql://postgres:postgres@localhost:5432/merch_table_test";

    const { prisma } = await import("@/lib/prisma");

    const orderUpdates: Array<{ emailStatus?: string }> = [];
    let hasReleaseFiles = false;

    restore.push(
      patchMethod(
        prisma.setupWizardState as unknown as AnyRecord,
        "findUnique",
        async () => null,
      ),
    );

    restore.push(
      patchMethod(prisma.order as unknown as AnyRecord, "update", async (args: AnyRecord) => {
        orderUpdates.push((args.data as { emailStatus?: string }) ?? {});
        return { id: "order-1" };
      }),
    );

    restore.push(
      patchMethod(prisma as unknown as AnyRecord, "$transaction", async (callback: (tx: AnyRecord) => Promise<unknown>) => {
        const tx: AnyRecord = {
          order: {
            findUnique: async () => null,
            create: async () => ({ id: "order-1" }),
          },
          release: {
            findFirst: async () => ({ id: "release-1", title: "Paid Release" }),
          },
          customer: {
            upsert: async () => ({ id: "customer-1" }),
          },
          orderItem: {
            create: async () => ({ id: "order-item-1" }),
          },
          releaseFile: {
            findMany: async () => (hasReleaseFiles ? [{ id: "release-file-1" }] : []),
            createMany: async () => {
              hasReleaseFiles = true;
              return { count: 1 };
            },
            updateMany: async () => ({ count: 1 }),
            deleteMany: async () => ({ count: 0 }),
          },
          trackAsset: {
            findMany: async () => [
              {
                storageKey: "org-1/releases/release-1/track-1.mp3",
                mimeType: "audio/mpeg",
                fileSizeBytes: 4567,
                format: "MP3",
                track: {
                  title: "Track One",
                  trackNumber: 1,
                },
              },
            ],
          },
          downloadEntitlement: {
            createMany: async () => ({ count: 1 }),
          },
          buyerLibraryToken: {
            create: async () => ({ token: "library-token-2" }),
          },
        };

        return callback(tx);
      }),
    );

    restore.push(
      patchMethod(Stripe.webhooks as unknown as AnyRecord, "constructEvent", () => ({
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_test_1",
            payment_status: "paid",
            amount_subtotal: 1200,
            amount_total: 1200,
            total_details: { amount_tax: 0 },
            currency: "usd",
            payment_intent: "pi_test_1",
            customer_details: { email: "buyer@example.com" },
            metadata: {
              organizationId: "org-1",
              releaseId: "release-1",
            },
          },
        },
      })),
    );

    const { POST } = await import("@/app/api/webhooks/stripe/route");

    const response = await POST(
      new Request("http://localhost:3000/api/webhooks/stripe", {
        method: "POST",
        headers: {
          "stripe-signature": "t=1,v1=fake",
          "content-type": "application/json",
        },
        body: "{}",
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, duplicate: false });
    assert.equal(getMockEmailSentCount("purchase_confirmation"), 1);
    assert.equal(orderUpdates.at(-1)?.emailStatus, "SENT");

    const email = getLastEmail();
    assert.ok(email);
    assert.equal(email.templateType, "purchase_confirmation");
    assert.equal(email.to, "buyer@example.com");
  });
});
