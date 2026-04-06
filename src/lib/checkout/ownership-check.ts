import { prisma } from "@/lib/prisma";

export const ALREADY_OWNED_CONFIRMATION_REQUIRED_CODE =
  "ALREADY_OWNED_CONFIRMATION_REQUIRED";

export async function hasExistingReleaseOwnership(input: {
  organizationId: string;
  releaseId: string;
  email: string;
}) {
  const existingEntitlement = await prisma.downloadEntitlement.findFirst({
    where: {
      releaseId: input.releaseId,
      customer: {
        organizationId: input.organizationId,
        email: input.email,
      },
    },
    select: { id: true },
  });

  return Boolean(existingEntitlement);
}
