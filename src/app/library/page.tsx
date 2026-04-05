import type { Metadata } from "next";

import { buyerTheme } from "@/app/buyer-theme";
import LibraryPageClient from "@/app/library/library-page-client";
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
      absolute: `Library | ${brandLabel}`,
    },
  };
}

export default function LibraryPage() {
  return (
    <div className={buyerTheme.page}>
      <StorefrontHeader />
      <LibraryPageClient />
    </div>
  );
}
