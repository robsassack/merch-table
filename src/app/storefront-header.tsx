import Link from "next/link";

import { buyerTheme, resolveBrandGlyph } from "@/app/buyer-theme";
import { prisma } from "@/lib/prisma";
import { resolveStorefrontBrandLabel } from "@/lib/storefront-brand";

export type StorefrontActivePage = "home" | "artists" | "find-my-purchases";

type StorefrontHeaderProps = {
  activePage?: StorefrontActivePage;
};

function resolveOptionalImageUrl(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export default async function StorefrontHeader({
  activePage,
}: StorefrontHeaderProps) {
  const settings = await prisma.storeSettings.findFirst({
    select: {
      organizationId: true,
      storeName: true,
      brandName: true,
      organization: {
        select: {
          name: true,
          owner: {
            select: {
              image: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const artistCount = await prisma.artist.count({
    where: {
      deletedAt: null,
      ...(settings?.organizationId ? { organizationId: settings.organizationId } : {}),
    },
  });

  const brandLabel = resolveStorefrontBrandLabel({
    storeName: settings?.storeName ?? null,
    brandName: settings?.brandName ?? null,
    organizationName: settings?.organization?.name ?? null,
  });
  const brandGlyph = resolveBrandGlyph(brandLabel);
  const organizationLogoUrl = resolveOptionalImageUrl(settings?.organization?.owner?.image);
  const showArtists = artistCount > 1;

  return (
    <header className={buyerTheme.header}>
      <div className={buyerTheme.headerInner}>
        <Link
          href="/"
          className="flex items-center gap-3 transition-opacity hover:opacity-80"
          aria-current={activePage === "home" ? "page" : undefined}
        >
          {organizationLogoUrl ? (
            <span className="inline-flex h-7 w-7 overflow-hidden rounded-full border border-zinc-200 bg-zinc-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={organizationLogoUrl}
                alt={`${brandLabel} logo`}
                className="h-full w-full object-cover"
              />
            </span>
          ) : (
            <span className={buyerTheme.brandBadge}>{brandGlyph}</span>
          )}
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
