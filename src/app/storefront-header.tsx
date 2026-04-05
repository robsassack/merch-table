import Link from "next/link";

import { buyerTheme, resolveBrandGlyph } from "@/app/buyer-theme";
import { prisma } from "@/lib/prisma";

export type StorefrontActivePage = "home" | "artists" | "find-my-purchases";

type StorefrontHeaderProps = {
  activePage?: StorefrontActivePage;
};

function resolveBrandLabel(input: {
  storeName: string | null;
  brandName: string | null;
}) {
  const storeName = input.storeName?.trim();
  if (storeName) return storeName;
  const brandName = input.brandName?.trim();
  if (brandName) return brandName;
  return "Storefront";
}

export default async function StorefrontHeader({
  activePage,
}: StorefrontHeaderProps) {
  const [settings, artistCount] = await Promise.all([
    prisma.storeSettings.findFirst({
      select: { storeName: true, brandName: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.artist.count({ where: { deletedAt: null } }),
  ]);

  const brandLabel = resolveBrandLabel({
    storeName: settings?.storeName ?? null,
    brandName: settings?.brandName ?? null,
  });
  const brandGlyph = resolveBrandGlyph(brandLabel);
  const showArtists = artistCount > 1;

  return (
    <header className={buyerTheme.header}>
      <div className={buyerTheme.headerInner}>
        <Link
          href="/"
          className="flex items-center gap-3 transition-opacity hover:opacity-80"
          aria-current={activePage === "home" ? "page" : undefined}
        >
          <span className={buyerTheme.brandBadge}>{brandGlyph}</span>
          <p className="text-lg font-semibold tracking-tight">{brandLabel}</p>
        </Link>
        <nav className={buyerTheme.nav}>
          {showArtists ? (
            <Link
              href="/artists"
              className={
                activePage === "artists"
                  ? "font-semibold text-zinc-900"
                  : buyerTheme.navLink
              }
              aria-current={activePage === "artists" ? "page" : undefined}
            >
              Artists
            </Link>
          ) : null}
          <Link
            href="/find-my-purchases"
            className={
              activePage === "find-my-purchases"
                ? "font-semibold text-zinc-900"
                : buyerTheme.navLink
            }
            aria-current={
              activePage === "find-my-purchases" ? "page" : undefined
            }
          >
            Find My Purchases
          </Link>
        </nav>
      </div>
    </header>
  );
}
