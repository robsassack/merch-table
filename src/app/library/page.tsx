import LibraryPageClient from "@/app/library/library-page-client";
import { prisma } from "@/lib/prisma";

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

export default async function LibraryPage() {
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

  return <LibraryPageClient brandLabel={brandLabel} />;
}
