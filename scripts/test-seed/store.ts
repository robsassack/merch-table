import { MembershipRole } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

import { FIXTURE_NOW, IDS } from "./fixtures";

export async function seedStoreBaseline() {
  await prisma.user.create({
    data: {
      id: IDS.adminUser,
      email: "admin@example.test",
      name: "Test Admin",
      emailVerified: true,
      createdAt: FIXTURE_NOW,
      updatedAt: FIXTURE_NOW,
    },
  });

  await prisma.organization.create({
    data: {
      id: IDS.organization,
      name: "Merch Table Test Store",
      slug: "test-store",
      ownerId: IDS.adminUser,
      createdAt: FIXTURE_NOW,
      updatedAt: FIXTURE_NOW,
    },
  });

  await prisma.membership.create({
    data: {
      id: IDS.membership,
      userId: IDS.adminUser,
      organizationId: IDS.organization,
      role: MembershipRole.OWNER,
      createdAt: FIXTURE_NOW,
      updatedAt: FIXTURE_NOW,
    },
  });

  await prisma.artist.create({
    data: {
      id: IDS.artist,
      organizationId: IDS.organization,
      ownerId: IDS.adminUser,
      name: "Test Artist",
      slug: "test-artist",
      location: "Detroit, MI",
      bio: "Deterministic artist fixture for integration and E2E tests.",
      createdAt: FIXTURE_NOW,
      updatedAt: FIXTURE_NOW,
    },
  });
}
