import FindMyPurchasesPageClient from "@/app/find-my-purchases/find-my-purchases-page-client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function resolveBrandLabel(input: { storeName: string | null; brandName: string | null }) {
  const storeName = input.storeName?.trim();
  if (storeName) {
    return storeName;
  }

  const brandName = input.brandName?.trim();
  if (brandName) {
    return brandName;
  }

  return "Storefront";
}

export default async function FindMyPurchasesPage() {
  const settings = await prisma.storeSettings.findFirst({
    select: {
      storeName: true,
      brandName: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const brandLabel = resolveBrandLabel({
    storeName: settings?.storeName ?? null,
    brandName: settings?.brandName ?? null,
  });

  return <FindMyPurchasesPageClient brandLabel={brandLabel} />;
}
