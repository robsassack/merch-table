"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { buildPaletteFromDominant } from "@/lib/release-artwork-palette-builder";
import { pickDominantArtworkColor } from "@/lib/release-artwork-dominant";
import {
  RELEASE_ARTWORK_PALETTE_COOKIE_NAME,
  serializeReleaseArtworkPaletteCookie,
} from "@/lib/release-artwork-palette-cookie";
import {
  DEFAULT_PALETTE,
  type ReleasePalette,
} from "@/lib/release-artwork-palette-shared";

type ReleaseArtworkThemeProps = {
  coverSrc: string;
  hasArtwork: boolean;
  initialPalette?: ReleasePalette | null;
  children: ReactNode;
};

const RELEASE_THEME_VARIABLE_ENTRIES: Array<[`--release-${string}`, keyof ReleasePalette]> = [
  ["--release-accent", "accent"],
  ["--release-accent-hover", "accentHover"],
  ["--release-accent-soft", "accentSoft"],
  ["--release-accent-contrast", "accentContrast"],
  ["--release-accent-text", "accentText"],
  ["--release-bg-start", "bgStart"],
  ["--release-bg-mid", "bgMid"],
  ["--release-bg-end", "bgEnd"],
];

async function resolvePaletteFromImageSource(src: string) {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.decoding = "async";

  const imageLoaded = new Promise<HTMLImageElement>((resolve, reject) => {
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load artwork image."));
  });

  image.src = src;

  try {
    const loadedImage = await imageLoaded;
    const colorThief = await import("colorthief");
    const color = await colorThief.getColor(loadedImage, { quality: 10 });
    const paletteColors = await colorThief
      .getPalette(loadedImage, { colorCount: 8, quality: 10 })
      .catch(() => null);
    const swatches = [
      color?.rgb?.(),
      ...(Array.isArray(paletteColors) ? paletteColors.map((entry) => entry?.rgb?.()) : []),
    ]
      .filter(
        (entry): entry is { r: number; g: number; b: number } =>
          Boolean(
            entry &&
              Number.isFinite(entry.r) &&
              Number.isFinite(entry.g) &&
              Number.isFinite(entry.b),
          ),
      )
      .map((entry) => ({ r: entry.r, g: entry.g, b: entry.b }));
    const rgb = pickDominantArtworkColor(swatches);
    if (!rgb) {
      return null;
    }
    return buildPaletteFromDominant(rgb);
  } catch {
    return null;
  }
}

export default function ReleaseArtworkTheme({
  coverSrc,
  hasArtwork,
  initialPalette,
  children,
}: ReleaseArtworkThemeProps) {
  const [runtimePaletteByCoverSrc, setRuntimePaletteByCoverSrc] = useState<{
    coverSrc: string;
    palette: ReleasePalette;
  } | null>(null);

  useEffect(() => {
    if (!hasArtwork) {
      return;
    }

    let disposed = false;
    void resolvePaletteFromImageSource(coverSrc).then((resolvedPalette) => {
      if (disposed || !resolvedPalette) {
        return;
      }
      setRuntimePaletteByCoverSrc({ coverSrc, palette: resolvedPalette });

      const serializedCookieValue = serializeReleaseArtworkPaletteCookie({
        coverSrc,
        palette: resolvedPalette,
      });
      if (serializedCookieValue) {
        document.cookie =
          `${RELEASE_ARTWORK_PALETTE_COOKIE_NAME}=${serializedCookieValue}; ` +
          `Max-Age=${60 * 60 * 24 * 30}; Path=/; SameSite=Lax`;
      }
    });

    return () => {
      disposed = true;
    };
  }, [coverSrc, hasArtwork]);

  const activePalette = useMemo(() => {
    if (!hasArtwork) {
      return DEFAULT_PALETTE;
    }
    if (runtimePaletteByCoverSrc?.coverSrc === coverSrc) {
      return runtimePaletteByCoverSrc.palette;
    }
    return initialPalette ?? DEFAULT_PALETTE;
  }, [coverSrc, hasArtwork, initialPalette, runtimePaletteByCoverSrc]);

  useEffect(() => {
    const rootStyle = document.documentElement.style;
    const previousValues = new Map<string, string>();

    for (const [variableName, paletteKey] of RELEASE_THEME_VARIABLE_ENTRIES) {
      previousValues.set(variableName, rootStyle.getPropertyValue(variableName));
      rootStyle.setProperty(variableName, activePalette[paletteKey]);
    }

    return () => {
      for (const [variableName] of RELEASE_THEME_VARIABLE_ENTRIES) {
        const previousValue = previousValues.get(variableName);
        if (previousValue && previousValue.trim().length > 0) {
          rootStyle.setProperty(variableName, previousValue);
          continue;
        }
        rootStyle.removeProperty(variableName);
      }
    };
  }, [activePalette]);

  const style = useMemo(
    () =>
      ({
        "--release-accent": activePalette.accent,
        "--release-accent-hover": activePalette.accentHover,
        "--release-accent-soft": activePalette.accentSoft,
        "--release-accent-contrast": activePalette.accentContrast,
        "--release-accent-text": activePalette.accentText,
        "--release-bg-start": activePalette.bgStart,
        "--release-bg-mid": activePalette.bgMid,
        "--release-bg-end": activePalette.bgEnd,
        backgroundImage:
          "radial-gradient(circle at 12% 12%, var(--release-bg-start) 0%, transparent 38%), radial-gradient(circle at 88% 0%, var(--release-bg-mid) 0%, transparent 32%), linear-gradient(180deg, var(--release-bg-end) 0%, #f4f7fb 100%)",
      }) as CSSProperties,
    [activePalette],
  );

  return (
    <div className="min-h-screen w-full text-zinc-900" style={style}>
      {children}
    </div>
  );
}
