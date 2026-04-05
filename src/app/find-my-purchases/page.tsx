import type { Metadata } from "next";

import { buyerTheme } from "@/app/buyer-theme";
import FindMyPurchasesPageClient from "@/app/find-my-purchases/find-my-purchases-page-client";
import StorefrontHeader from "@/app/storefront-header";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Find My Purchases",
};

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
