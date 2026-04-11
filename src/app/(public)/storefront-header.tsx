import Image from "next/image";
import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";

import { buyerTheme, resolveBrandGlyph } from "@/app/(public)/buyer-theme";
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

function resolveCoverProxySrc(value: string | null | undefined) {
  const imageUrl = resolveOptionalImageUrl(value);
  if (!imageUrl) {
    return null;
  }

  return `/api/cover?url=${encodeURIComponent(imageUrl)}`;
}

export default async function StorefrontHeader({
  activePage,
}: StorefrontHeaderProps) {
  noStore();

  const settings = await prisma.storeSettings.findFirst({
    where: {
      setupComplete: true,
    },
    select: {
      organizationId: true,
      storeName: true,
      brandName: true,
      organizationLogoUrl: true,
      organization: {
        select: {
          name: true,
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
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
  const organizationLogoUrl = resolveCoverProxySrc(settings?.organizationLogoUrl);
  const showArtists = artistCount > 1;
  const activeNavLinkClassName =
    "rounded-md px-1.5 py-0.5 font-semibold text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700";

  return (
    <header className={buyerTheme.header}>
      <div className={buyerTheme.headerInner}>
        <Link
          href="/"
          className="flex items-center gap-3 rounded-md transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
          aria-current={activePage === "home" ? "page" : undefined}
        >
          {organizationLogoUrl ? (
            <Image
              src={organizationLogoUrl}
              alt={`${brandLabel} logo`}
              width={320}
              height={80}
              sizes="(max-width: 768px) 56vw, 18rem"
              className="block h-10 w-auto max-w-[min(56vw,18rem)] shrink-0 border-0 object-contain"
              style={{
                border: 0,
                borderRadius: 0,
                clipPath: "none",
                WebkitClipPath: "none",
                maskImage: "none",
                WebkitMaskImage: "none",
                overflow: "visible",
                background: "transparent",
              }}
            />
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
                  ? activeNavLinkClassName
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
                ? activeNavLinkClassName
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
