import { MembershipRole, StoreStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

type CompleteSetupInput = {
  orgName: string;
  storeName: string;
  contactEmail: string;
  currency: string;
  adminEmail: string;
};

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug.length > 0 ? slug : "main-store";
}

function getOrganizationSlug(orgName: string) {
  const configuredSlug = process.env.STORE_ORG_SLUG?.trim();
  if (configuredSlug) {
    return slugify(configuredSlug);
  }

  return slugify(orgName);
}

export async function completeSetup(input: CompleteSetupInput) {
  const organizationSlug = getOrganizationSlug(input.orgName);

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { email: input.adminEmail },
      update: {},
      create: {
        email: input.adminEmail,
      },
      select: { id: true, email: true },
    });

    const organization = await tx.organization.upsert({
      where: { slug: organizationSlug },
      update: {
        name: input.orgName,
        ownerId: user.id,
      },
      create: {
        name: input.orgName,
        slug: organizationSlug,
        ownerId: user.id,
      },
      select: { id: true, slug: true },
    });

    await tx.membership.upsert({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: organization.id,
        },
      },
      update: {
        role: MembershipRole.OWNER,
      },
      create: {
        userId: user.id,
        organizationId: organization.id,
        role: MembershipRole.OWNER,
      },
    });

    await tx.storeSettings.upsert({
      where: { organizationId: organization.id },
      update: {
        storeStatus: StoreStatus.PRIVATE,
        setupComplete: true,
        storeName: input.storeName,
        brandName: input.orgName,
        contactEmail: input.contactEmail,
        supportEmail: input.contactEmail,
        currency: input.currency,
      },
      create: {
        organizationId: organization.id,
        storeStatus: StoreStatus.PRIVATE,
        setupComplete: true,
        storeName: input.storeName,
        brandName: input.orgName,
        contactEmail: input.contactEmail,
        supportEmail: input.contactEmail,
        currency: input.currency,
      },
      select: { id: true },
    });

    return {
      organizationId: organization.id,
      organizationSlug: organization.slug,
      adminEmail: user.email,
    };
  });

  return result;
}
