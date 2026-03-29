import { MembershipRole } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

export async function userHasAdminAccessToOrganization(input: {
  userId: string;
  organizationId: string;
}) {
  const organization = await prisma.organization.findFirst({
    where: {
      id: input.organizationId,
      OR: [
        { ownerId: input.userId },
        {
          memberships: {
            some: {
              userId: input.userId,
              role: { in: [MembershipRole.OWNER, MembershipRole.ADMIN] },
            },
          },
        },
      ],
    },
    select: { id: true },
  });

  return Boolean(organization);
}

export async function adminEmailHasAccessToOrganization(input: {
  email: string;
  organizationId: string;
}) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (!user) {
    return false;
  }

  return userHasAdminAccessToOrganization({
    userId: user.id,
    organizationId: input.organizationId,
  });
}
