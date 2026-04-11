"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import {
  BRAND_FALLBACK_PALETTE,
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

type RgbColor = { r: number; g: number; b: number };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function mixColor(a: RgbColor, b: RgbColor, amount: number): RgbColor {
  const ratio = clamp(amount, 0, 1);
  return {
    r: Math.round(a.r + (b.r - a.r) * ratio),
    g: Math.round(a.g + (b.g - a.g) * ratio),
    b: Math.round(a.b + (b.b - a.b) * ratio),
  };
}

function rgbToCss(color: RgbColor) {
  return `rgb(${color.r} ${color.g} ${color.b})`;
}

function rgbToHsl(color: RgbColor) {
  const r = color.r / 255;
  const g = color.g / 255;
  const b = color.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const delta = max - min;
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    switch (max) {
      case r:
        h = (g - b) / delta + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / delta + 2;
        break;
      default:
        h = (r - g) / delta + 4;
        break;
    }
    h /= 6;
  }

  return { h, s, l };
}

function hueToRgb(p: number, q: number, t: number) {
  if (t < 0) {
    return t + 1;
  }
  if (t > 1) {
    return t - 1;
  }
  if (t < 1 / 6) {
    return p + (q - p) * 6 * t;
  }
  if (t < 1 / 2) {
    return q;
  }
  if (t < 2 / 3) {
    return p + (q - p) * (2 / 3 - t) * 6;
  }
  return p;
}

function hslToRgb(input: { h: number; s: number; l: number }): RgbColor {
  const h = input.h;
  const s = clamp(input.s, 0, 1);
  const l = clamp(input.l, 0, 1);
  if (s === 0) {
    const value = Math.round(l * 255);
    return { r: value, g: value, b: value };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: Math.round(hueToRgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hueToRgb(p, q, h) * 255),
    b: Math.round(hueToRgb(p, q, h - 1 / 3) * 255),
  };
}

function resolveRelativeLuminance(color: RgbColor): number {
  const toLinear = (channel: number) => {
    const normalized = clamp(channel / 255, 0, 1);
    if (normalized <= 0.03928) {
      return normalized / 12.92;
    }
    return ((normalized + 0.055) / 1.055) ** 2.4;
  };
  const red = toLinear(color.r);
  const green = toLinear(color.g);
  const blue = toLinear(color.b);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function resolveContrastRatio(foreground: RgbColor, background: RgbColor): number {
  const fg = resolveRelativeLuminance(foreground);
  const bg = resolveRelativeLuminance(background);
  const lighter = Math.max(fg, bg);
  const darker = Math.min(fg, bg);
  return (lighter + 0.05) / (darker + 0.05);
}

function ensureAccentContrast(
  accent: RgbColor,
  minContrast = 4.5,
): { accent: RgbColor; contrastText: RgbColor } {
  const white = { r: 255, g: 255, b: 255 };
  const dark = { r: 17, g: 24, b: 39 };

  const whiteContrast = resolveContrastRatio(white, accent);
  const darkContrast = resolveContrastRatio(dark, accent);
  const initialText = whiteContrast >= darkContrast ? white : dark;
  if (Math.max(whiteContrast, darkContrast) >= minContrast) {
    return { accent, contrastText: initialText };
  }

  // Nudge lightness only when needed to satisfy contrast.
  const accentHsl = rgbToHsl(accent);
  const shouldDarken = initialText === white;
  for (let step = 1; step <= 8; step += 1) {
    const candidate = hslToRgb({
      h: accentHsl.h,
      s: accentHsl.s,
      l: clamp(accentHsl.l + (shouldDarken ? -1 : 1) * step * 0.04, 0.2, 0.8),
    });
    const nextWhite = resolveContrastRatio(white, candidate);
    const nextDark = resolveContrastRatio(dark, candidate);
    const nextText = nextWhite >= nextDark ? white : dark;
    if (Math.max(nextWhite, nextDark) >= minContrast) {
      return { accent: candidate, contrastText: nextText };
    }
  }

  return { accent, contrastText: initialText };
}

function buildPaletteFromDominant(dominant: RgbColor): ReleasePalette {
  const { accent, contrastText } = ensureAccentContrast(dominant);
  const accentHover = mixColor(accent, { r: 0, g: 0, b: 0 }, 0.16);
  const accentSoft = mixColor(accent, { r: 255, g: 255, b: 255 }, 0.46);
  const bgStart = mixColor(dominant, { r: 255, g: 255, b: 255 }, 0.84);
  const bgMid = mixColor(dominant, { r: 255, g: 255, b: 255 }, 0.9);
  const bgEnd = mixColor(dominant, { r: 255, g: 255, b: 255 }, 0.95);

  return {
    accent: rgbToCss(accent),
    accentHover: rgbToCss(accentHover),
    accentSoft: rgbToCss(accentSoft),
    accentContrast: rgbToCss(contrastText),
    accentText: rgbToCss(accentHover),
    bgStart: rgbToCss(bgStart),
    bgMid: rgbToCss(bgMid),
    bgEnd: rgbToCss(bgEnd),
  };
}

export default function ReleaseArtworkTheme({
  coverSrc,
  hasArtwork,
  initialPalette,
  children,
}: ReleaseArtworkThemeProps) {
  const [palette, setPalette] = useState<ReleasePalette>(initialPalette ?? DEFAULT_PALETTE);

  useEffect(() => {
    if (!hasArtwork) {
      return;
    }

    let active = true;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = async () => {
      if (!active) {
        return;
      }

      try {
        const colorThief = await import("colorthief");
        const color = await colorThief.getColor(image, { quality: 10 });
        const rgb = color?.rgb();
        if (!rgb) {
          setPalette(initialPalette ?? DEFAULT_PALETTE);
          return;
        }
        if (!active) {
          return;
        }
        setPalette(buildPaletteFromDominant({ r: rgb.r, g: rgb.g, b: rgb.b }));
      } catch {
        if (active) {
          setPalette(initialPalette ?? DEFAULT_PALETTE);
        }
      }
    };
    image.onerror = () => {
      if (active) {
        setPalette(initialPalette ?? DEFAULT_PALETTE);
      }
    };
    image.src = coverSrc;

    return () => {
      active = false;
    };
  }, [coverSrc, hasArtwork, initialPalette]);

  const activePalette = hasArtwork ? palette : BRAND_FALLBACK_PALETTE;

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
  }, [activePalette, coverSrc]);

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
