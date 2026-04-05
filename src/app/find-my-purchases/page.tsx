import type { Metadata } from "next";

import { buyerTheme } from "@/app/buyer-theme";
import FindMyPurchasesPageClient from "@/app/find-my-purchases/find-my-purchases-page-client";
import StorefrontHeader from "@/app/storefront-header";
import { prisma } from "@/lib/prisma";
import { resolveStorefrontBrandLabel } from "@/lib/storefront-brand";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await prisma.storeSettings.findFirst({
    select: {
      storeName: true,
      brandName: true,
      organization: {
        select: { name: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const brandLabel = resolveStorefrontBrandLabel({
    storeName: settings?.storeName ?? null,
    brandName: settings?.brandName ?? null,
    organizationName: settings?.organization?.name ?? null,
  });

  return {
    title: {
      absolute: `Find My Purchases | ${brandLabel}`,
    },
  };
}

export default async function FindMyPurchasesPage() {
  const settings = await prisma.storeSettings.findFirst({
    select: { contactEmail: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className={buyerTheme.page}>
      <StorefrontHeader activePage="find-my-purchases" />
      <FindMyPurchasesPageClient contactEmail={settings?.contactEmail ?? null} />
    </div>
  );
}
