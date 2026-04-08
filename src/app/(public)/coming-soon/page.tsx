import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

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
      absolute: `Store Is Private | ${brandLabel}`,
    },
  };
}

export default async function ComingSoonPage() {
  const settings = await prisma.storeSettings.findFirst({
    select: { storeStatus: true },
    orderBy: { createdAt: "asc" },
  });

  if (settings?.storeStatus === "PUBLIC") {
    redirect("/");
  }

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="operator-theme min-h-screen w-full px-4 py-10 sm:px-6 sm:py-16"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col justify-center">
        <section className="rounded-3xl border border-slate-700 bg-slate-900/85 p-8 text-center shadow-[0_30px_80px_-38px_rgba(5,9,18,0.85)] backdrop-blur sm:p-10">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-100">
            Store Is Private
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            This storefront is not public yet. Please check back soon.
          </p>
          <p className="mt-6 text-sm text-zinc-500">
            Existing buyers can still access{" "}
            <Link href="/find-my-purchases" className="font-medium text-zinc-300 underline">
              Find My Purchases
            </Link>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
