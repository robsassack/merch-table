import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

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

describe("POST /api/checkout/free", () => {
  const restore: Array<() => void> = [];

  afterEach(() => {
    while (restore.length > 0) {
      const fn = restore.pop();
      fn?.();
    }
    resetMockEmailProviderState();
    delete process.env.EMAIL_PROVIDER;
  });

  it("marks order email as SENT and emits a mock free library email", async () => {
    process.env.EMAIL_PROVIDER = "mock";
    process.env.SMTP_FROM = "no-reply@example.com";
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
        title: "Free Release",
      })),
    );
    restore.push(
      patchMethod(
        prisma.downloadEntitlement as unknown as AnyRecord,
        "findFirst",
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
          customer: {
            upsert: async () => ({ id: "customer-1" }),
          },
          order: {
            create: async () => ({ id: "order-1" }),
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
          },
          trackAsset: {
            findMany: async () => [
              {
                storageKey: "org-1/releases/release-1/track-1.mp3",
                mimeType: "audio/mpeg",
                fileSizeBytes: 1234,
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
            create: async () => ({ token: "library-token-1" }),
          },
        };

        return callback(tx);
      }),
    );

    const { POST } = await import("@/app/api/checkout/free/route");

    const response = await POST(
      new Request("http://localhost:3000/api/checkout/free", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          releaseId: "release-1",
          email: "buyer@example.com",
        }),
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(getMockEmailSentCount("free_library_link"), 1);
    assert.equal(orderUpdates.at(-1)?.emailStatus, "SENT");

    const email = getLastEmail();
    assert.ok(email);
    assert.equal(email.templateType, "free_library_link");
    assert.equal(email.to, "buyer@example.com");
  });

  it("allows a repeat free checkout even when the email already owns the release", async () => {
    process.env.EMAIL_PROVIDER = "mock";
    process.env.SMTP_FROM = "no-reply@example.com";
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
        title: "Free Release",
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
      patchMethod(prisma.order as unknown as AnyRecord, "update", async (args: AnyRecord) => {
        orderUpdates.push((args.data as { emailStatus?: string }) ?? {});
        return { id: "order-1" };
      }),
    );
    restore.push(
      patchMethod(prisma as unknown as AnyRecord, "$transaction", async (callback: (tx: AnyRecord) => Promise<unknown>) => {
        const tx: AnyRecord = {
          customer: {
            upsert: async () => ({ id: "customer-1" }),
          },
          order: {
            create: async () => ({ id: "order-1" }),
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
          },
          trackAsset: {
            findMany: async () => [
              {
                storageKey: "org-1/releases/release-1/track-1.mp3",
                mimeType: "audio/mpeg",
                fileSizeBytes: 1234,
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
            create: async () => ({ token: "library-token-1" }),
          },
        };

        return callback(tx);
      }),
    );

    const { POST } = await import("@/app/api/checkout/free/route");

    const response = await POST(
      new Request("http://localhost:3000/api/checkout/free", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "198.51.100.42",
        },
        body: JSON.stringify({
          releaseId: "release-1",
          email: "buyer+zero-pwyw@example.com",
        }),
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(getMockEmailSentCount("free_library_link"), 1);
    assert.equal(orderUpdates.at(-1)?.emailStatus, "SENT");
  });

  it("allows zero-dollar PWYW releases through the free checkout path", async () => {
    process.env.EMAIL_PROVIDER = "mock";
    process.env.SMTP_FROM = "no-reply@example.com";
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
      patchMethod(prisma.release as unknown as AnyRecord, "findFirst", async (args: AnyRecord) => {
        const where = (args.where ?? {}) as { OR?: Array<Record<string, unknown>> };
        const branches = Array.isArray(where.OR) ? where.OR : [];
        const hasFreeBranch = branches.some((branch) => branch.pricingMode === "FREE");
        const hasZeroPwywBranch = branches.some(
          (branch) => branch.pricingMode === "PWYW" && branch.minimumPriceCents === 0,
        );

        assert.equal(hasFreeBranch, true);
        assert.equal(hasZeroPwywBranch, true);

        return {
          id: "release-1",
          title: "Zero Minimum PWYW Release",
        };
      }),
    );
    restore.push(
      patchMethod(
        prisma.downloadEntitlement as unknown as AnyRecord,
        "findFirst",
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
          customer: {
            upsert: async () => ({ id: "customer-1" }),
          },
          order: {
            create: async () => ({ id: "order-1" }),
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
          },
          trackAsset: {
            findMany: async () => [
              {
                storageKey: "org-1/releases/release-1/track-1.mp3",
                mimeType: "audio/mpeg",
                fileSizeBytes: 1234,
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
            create: async () => ({ token: "library-token-1" }),
          },
        };

        return callback(tx);
      }),
    );

    const { POST } = await import("@/app/api/checkout/free/route");

    const response = await POST(
      new Request("http://localhost:3000/api/checkout/free", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          releaseId: "release-1",
          email: "buyer@example.com",
        }),
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(getMockEmailSentCount("free_library_link"), 1);
    assert.equal(orderUpdates.at(-1)?.emailStatus, "SENT");
  });
});
