import type { Metadata } from "next";

import { buyerTheme } from "@/app/buyer-theme";
import LibraryPageClient from "@/app/library/library-page-client";
import StorefrontHeader from "@/app/storefront-header";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Library",
};

export default function LibraryPage() {
  return (
    <div className={buyerTheme.page}>
      <StorefrontHeader />
      <LibraryPageClient />
    </div>
  );
}
