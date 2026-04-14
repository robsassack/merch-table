"use client";

import Image from "next/image";
import { useState } from "react";

import { buyerTheme } from "@/app/(public)/buyer-theme";

type StorefrontBrandLogoProps = {
  logoUrl: string | null;
  brandLabel: string;
  brandGlyph: string;
};

export default function StorefrontBrandLogo({
  logoUrl,
  brandLabel,
  brandGlyph,
}: StorefrontBrandLogoProps) {
  const [hasError, setHasError] = useState(false);

  if (!logoUrl || hasError) {
    return <span className={buyerTheme.brandBadge}>{brandGlyph}</span>;
  }

  return (
    <span className="relative block h-10 w-7 shrink-0 overflow-visible">
      <Image
        src={logoUrl}
        alt={`${brandLabel} logo`}
        width={320}
        height={80}
        sizes="160px"
        priority
        className="absolute top-1/2 right-0 h-10 w-auto max-w-[min(56vw,10rem)] -translate-y-1/2 border-0 object-contain"
        onError={() => setHasError(true)}
        style={{
          border: 0,
          borderRadius: 0,
          clipPath: "none",
          WebkitClipPath: "none",
          maskImage: "none",
          WebkitMaskImage: "none",
          overflow: "visible",
        }}
      />
    </span>
  );
}
