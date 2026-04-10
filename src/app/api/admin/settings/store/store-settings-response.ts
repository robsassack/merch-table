import { prisma } from "@/lib/prisma";

type BuildStoreSettingsResponseDataInput = {
  organizationId: string;
  userId: string;
  fallbackAdminEmail: string;
};

const storeSettingsSelect = {
  storeName: true,
  organizationLogoUrl: true,
  contactEmail: true,
  currency: true,
  storeStatus: true,
  featuredReleaseId: true,
  defaultReleaseArtistId: true,
  defaultReleasePricingMode: true,
  defaultReleaseStatus: true,
  defaultReleaseType: true,
  defaultReleasePwywMinimumCents: true,
  defaultReleaseAllowFreeCheckout: true,
  defaultPreviewMode: true,
  defaultPreviewSeconds: true,
  organization: {
    select: { name: true },
  },
} as const;

async function loadStoreSettingsBundle(input: {
  organizationId: string;
  userId: string;
}) {
  const [settings, artists, adminUser] = await Promise.all([
    prisma.storeSettings.findFirst({
      where: { organizationId: input.organizationId },
      select: storeSettingsSelect,
    }),
    prisma.artist.findMany({
      where: {
        organizationId: input.organizationId,
        deletedAt: null,
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: input.userId },
      select: { email: true },
    }),
  ]);

  return {
    settings,
    artists,
    adminUser,
  };
}

export async function buildStoreSettingsResponseData({
  organizationId,
  userId,
  fallbackAdminEmail,
}: BuildStoreSettingsResponseDataInput) {
  const { settings, artists, adminUser } = await loadStoreSettingsBundle({
    organizationId,
    userId,
  });

  return {
    orgName: settings?.organization?.name ?? "",
    storeName: settings?.storeName ?? "",
    organizationLogoUrl: settings?.organizationLogoUrl ?? null,
    contactEmail: settings?.contactEmail ?? "",
    adminEmail: adminUser?.email ?? fallbackAdminEmail,
    currency: settings?.currency ?? "USD",
    storeStatus: settings?.storeStatus ?? "SETUP",
    featuredReleaseId: settings?.featuredReleaseId ?? null,
    defaultReleaseArtistId: settings?.defaultReleaseArtistId ?? null,
    defaultReleasePricingMode: settings?.defaultReleasePricingMode ?? null,
    defaultReleaseStatus: settings?.defaultReleaseStatus ?? null,
    defaultReleaseType: settings?.defaultReleaseType ?? null,
    defaultReleasePwywMinimumCents: settings?.defaultReleasePwywMinimumCents ?? null,
    defaultReleaseAllowFreeCheckout: settings?.defaultReleaseAllowFreeCheckout ?? null,
    defaultPreviewMode: settings?.defaultPreviewMode ?? "CLIP",
    defaultPreviewSeconds: settings?.defaultPreviewSeconds ?? 30,
    releaseDefaultArtists: artists.map((artist) => ({
      id: artist.id,
      name: artist.name,
    })),
  };
}
