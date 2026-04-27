import { EmailStatus, OrderStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

import {
  ENTITLEMENT_TOKENS,
  EXPIRED_AT,
  FIXTURE_NOW,
  FUTURE_AT,
  IDS,
  LIBRARY_TOKENS,
  PAID_AT,
  releaseFileIdFor,
  REVOKED_AT,
} from "./fixtures";

type OrderInput = {
  id: string;
  customerId: string;
  orderNumber: string;
  status: (typeof OrderStatus)[keyof typeof OrderStatus];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  checkoutSessionId: string | null;
  paymentIntentId: string | null;
  emailStatus: (typeof EmailStatus)[keyof typeof EmailStatus];
  emailSentAt: Date | null;
  paidAt: Date | null;
  releaseId: string;
  unitPriceCents: number;
};

type EntitlementInput = {
  id: string;
  customerId: string;
  releaseId: string;
  releaseFileId: string;
  orderId: string;
  token: string;
  expiresAt: Date | null;
};

const customerFixtures = [
  {
    id: IDS.customers.paid,
    email: "paid@example.test",
    name: "Paid Customer",
  },
  {
    id: IDS.customers.failed,
    email: "failed@example.test",
    name: "Failed Customer",
  },
  {
    id: IDS.customers.revoked,
    email: "revoked@example.test",
    name: "Revoked Customer",
  },
  {
    id: IDS.customers.expired,
    email: "expired@example.test",
    name: "Expired Customer",
  },
];

const orderFixtures: OrderInput[] = [
  {
    id: IDS.orders.free,
    customerId: IDS.customers.paid,
    orderNumber: "FREE-TEST-0001",
    status: OrderStatus.FULFILLED,
    subtotalCents: 0,
    taxCents: 0,
    totalCents: 0,
    checkoutSessionId: null,
    paymentIntentId: null,
    emailStatus: EmailStatus.SENT,
    emailSentAt: PAID_AT,
    paidAt: PAID_AT,
    releaseId: IDS.releases.free,
    unitPriceCents: 0,
  },
  {
    id: IDS.orders.fixed,
    customerId: IDS.customers.paid,
    orderNumber: "STRIPE-TEST-0001",
    status: OrderStatus.PAID,
    subtotalCents: 700,
    taxCents: 42,
    totalCents: 742,
    checkoutSessionId: "cs_test_seed_fixed_success",
    paymentIntentId: "pi_test_seed_fixed_success",
    emailStatus: EmailStatus.SENT,
    emailSentAt: PAID_AT,
    paidAt: PAID_AT,
    releaseId: IDS.releases.fixed,
    unitPriceCents: 700,
  },
  {
    id: IDS.orders.failed,
    customerId: IDS.customers.failed,
    orderNumber: "STRIPE-TEST-FAILED-0001",
    status: OrderStatus.CANCELED,
    subtotalCents: 700,
    taxCents: 0,
    totalCents: 700,
    checkoutSessionId: "cs_test_seed_fixed_failed",
    paymentIntentId: null,
    emailStatus: EmailStatus.FAILED,
    emailSentAt: null,
    paidAt: null,
    releaseId: IDS.releases.fixed,
    unitPriceCents: 700,
  },
  {
    id: IDS.orders.revoked,
    customerId: IDS.customers.revoked,
    orderNumber: "STRIPE-TEST-REVOKED-0001",
    status: OrderStatus.PAID,
    subtotalCents: 700,
    taxCents: 42,
    totalCents: 742,
    checkoutSessionId: "cs_test_seed_revoked",
    paymentIntentId: "pi_test_seed_revoked",
    emailStatus: EmailStatus.SENT,
    emailSentAt: PAID_AT,
    paidAt: PAID_AT,
    releaseId: IDS.releases.fixed,
    unitPriceCents: 700,
  },
  {
    id: IDS.orders.expired,
    customerId: IDS.customers.expired,
    orderNumber: "STRIPE-TEST-EXPIRED-0001",
    status: OrderStatus.PAID,
    subtotalCents: 700,
    taxCents: 42,
    totalCents: 742,
    checkoutSessionId: "cs_test_seed_expired",
    paymentIntentId: "pi_test_seed_expired",
    emailStatus: EmailStatus.SENT,
    emailSentAt: PAID_AT,
    paidAt: PAID_AT,
    releaseId: IDS.releases.fixed,
    unitPriceCents: 700,
  },
];

const entitlementFixtures: EntitlementInput[] = [
  {
    id: "entitlement_test_free_mp3",
    customerId: IDS.customers.paid,
    releaseId: IDS.releases.free,
    releaseFileId: releaseFileIdFor("free", "mp3"),
    orderId: IDS.orders.free,
    token: ENTITLEMENT_TOKENS.freeMp3,
    expiresAt: null,
  },
  {
    id: "entitlement_test_fixed_flac",
    customerId: IDS.customers.paid,
    releaseId: IDS.releases.fixed,
    releaseFileId: releaseFileIdFor("fixed", "flac"),
    orderId: IDS.orders.fixed,
    token: ENTITLEMENT_TOKENS.fixedFlac,
    expiresAt: null,
  },
  {
    id: "entitlement_test_fixed_mp3",
    customerId: IDS.customers.paid,
    releaseId: IDS.releases.fixed,
    releaseFileId: releaseFileIdFor("fixed", "mp3"),
    orderId: IDS.orders.fixed,
    token: ENTITLEMENT_TOKENS.fixedMp3,
    expiresAt: FUTURE_AT,
  },
  {
    id: "entitlement_test_failed_fixed_mp3",
    customerId: IDS.customers.failed,
    releaseId: IDS.releases.fixed,
    releaseFileId: releaseFileIdFor("fixed", "mp3"),
    orderId: IDS.orders.failed,
    token: ENTITLEMENT_TOKENS.failedFixedMp3,
    expiresAt: null,
  },
  {
    id: "entitlement_test_revoked_fixed_flac",
    customerId: IDS.customers.revoked,
    releaseId: IDS.releases.fixed,
    releaseFileId: releaseFileIdFor("fixed", "flac"),
    orderId: IDS.orders.revoked,
    token: ENTITLEMENT_TOKENS.revokedFixedFlac,
    expiresAt: null,
  },
  {
    id: "entitlement_test_expired_fixed_flac",
    customerId: IDS.customers.expired,
    releaseId: IDS.releases.fixed,
    releaseFileId: releaseFileIdFor("fixed", "flac"),
    orderId: IDS.orders.expired,
    token: ENTITLEMENT_TOKENS.expiredFixedFlac,
    expiresAt: EXPIRED_AT,
  },
];

async function createOrder(input: OrderInput) {
  await prisma.order.create({
    data: {
      id: input.id,
      organizationId: IDS.organization,
      customerId: input.customerId,
      orderNumber: input.orderNumber,
      status: input.status,
      currency: "USD",
      subtotalCents: input.subtotalCents,
      taxCents: input.taxCents,
      totalCents: input.totalCents,
      checkoutSessionId: input.checkoutSessionId,
      paymentIntentId: input.paymentIntentId,
      taxCentsFromStripe: input.taxCents,
      emailStatus: input.emailStatus,
      emailSentAt: input.emailSentAt,
      paidAt: input.paidAt,
      createdAt: input.paidAt ?? FIXTURE_NOW,
      updatedAt: FIXTURE_NOW,
    },
  });

  await prisma.orderItem.create({
    data: {
      id: `${input.id}_item_1`,
      orderId: input.id,
      releaseId: input.releaseId,
      lineNumber: 1,
      quantity: 1,
      unitPriceCents: input.unitPriceCents,
      totalPriceCents: input.unitPriceCents,
      createdAt: input.paidAt ?? FIXTURE_NOW,
      updatedAt: FIXTURE_NOW,
    },
  });
}

async function createEntitlement(input: EntitlementInput) {
  await prisma.downloadEntitlement.create({
    data: {
      id: input.id,
      customerId: input.customerId,
      releaseId: input.releaseId,
      releaseFileId: input.releaseFileId,
      orderItemId: `${input.orderId}_item_1`,
      token: input.token,
      expiresAt: input.expiresAt,
      createdAt: PAID_AT,
      updatedAt: FIXTURE_NOW,
    },
  });
}

async function seedLibraryTokens() {
  await prisma.buyerLibraryToken.createMany({
    data: [
      {
        id: IDS.libraryTokens.valid,
        organizationId: IDS.organization,
        customerId: IDS.customers.paid,
        token: LIBRARY_TOKENS.valid,
        expiresAt: null,
        revokedAt: null,
        lastUsedAt: null,
        accessCount: 0,
        createdAt: FIXTURE_NOW,
        updatedAt: FIXTURE_NOW,
      },
      {
        id: IDS.libraryTokens.revoked,
        organizationId: IDS.organization,
        customerId: IDS.customers.revoked,
        token: LIBRARY_TOKENS.revoked,
        expiresAt: null,
        revokedAt: REVOKED_AT,
        lastUsedAt: null,
        accessCount: 0,
        createdAt: FIXTURE_NOW,
        updatedAt: FIXTURE_NOW,
      },
      {
        id: IDS.libraryTokens.expired,
        organizationId: IDS.organization,
        customerId: IDS.customers.expired,
        token: LIBRARY_TOKENS.expired,
        expiresAt: EXPIRED_AT,
        revokedAt: null,
        lastUsedAt: null,
        accessCount: 0,
        createdAt: FIXTURE_NOW,
        updatedAt: FIXTURE_NOW,
      },
    ],
  });
}

export async function seedCustomersOrdersAndTokens() {
  await prisma.customer.createMany({
    data: customerFixtures.map((customer) => ({
      ...customer,
      organizationId: IDS.organization,
      createdAt: FIXTURE_NOW,
      updatedAt: FIXTURE_NOW,
    })),
  });

  for (const order of orderFixtures) {
    await createOrder(order);
  }
  for (const entitlement of entitlementFixtures) {
    await createEntitlement(entitlement);
  }

  await seedLibraryTokens();
}
