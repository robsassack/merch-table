"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

type ReleaseArtworkThemeProps = {
  coverSrc: string;
  hasArtwork: boolean;
  children: ReactNode;
};

type RgbColor = {
  r: number;
  g: number;
  b: number;
};

type HslColor = {
  h: number;
  s: number;
  l: number;
};

type ReleasePalette = {
  accent: string;
  accentHover: string;
  accentSoft: string;
  accentContrast: string;
  accentText: string;
  bgStart: string;
  bgMid: string;
  bgEnd: string;
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

const DEFAULT_PALETTE: ReleasePalette = {
  accent: "rgb(51 65 85)",
  accentHover: "rgb(30 41 59)",
  accentSoft: "rgb(203 213 225)",
  accentContrast: "rgb(255 255 255)",
  accentText: "rgb(30 41 59)",
  bgStart: "rgb(232 238 247)",
  bgMid: "rgb(226 236 255)",
  bgEnd: "rgb(245 248 252)",
};

const BRAND_FALLBACK_PALETTE: ReleasePalette = {
  accent: "rgb(16 185 129)",
  accentHover: "rgb(5 150 105)",
  accentSoft: "rgb(110 231 183)",
  accentContrast: "rgb(255 255 255)",
  accentText: "rgb(5 150 105)",
  bgStart: "rgb(221 245 234)",
  bgMid: "rgb(226 236 255)",
  bgEnd: "rgb(248 251 250)",
};

const PALETTE_CACHE_KEY_PREFIX = "mt:release-palette:";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function rgbToCss(color: RgbColor) {
  return `rgb(${color.r} ${color.g} ${color.b})`;
}

function mixColor(a: RgbColor, b: RgbColor, amount: number): RgbColor {
  const ratio = clamp(amount, 0, 1);
  return {
    r: Math.round(a.r + (b.r - a.r) * ratio),
    g: Math.round(a.g + (b.g - a.g) * ratio),
    b: Math.round(a.b + (b.b - a.b) * ratio),
  };
}

function rgbToHsl(color: RgbColor): HslColor {
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

function hslToRgb(color: HslColor): RgbColor {
  const h = color.h;
  const s = clamp(color.s, 0, 1);
  const l = clamp(color.l, 0, 1);

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

function resolveTextContrast(color: RgbColor): string {
  const luminance = (0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b) / 255;
  return luminance > 0.55 ? "rgb(17 24 39)" : "rgb(255 255 255)";
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

function ensureMinimumTextContrast(
  foreground: RgbColor,
  background: RgbColor,
  minimumContrastRatio = 4.5,
): RgbColor {
  if (resolveContrastRatio(foreground, background) >= minimumContrastRatio) {
    return foreground;
  }

  for (let step = 1; step <= 10; step += 1) {
    const candidate = mixColor(foreground, { r: 0, g: 0, b: 0 }, step * 0.1);
    if (resolveContrastRatio(candidate, background) >= minimumContrastRatio) {
      return candidate;
    }
  }

  return mixColor(foreground, { r: 0, g: 0, b: 0 }, 1);
}

function normalizeAccentColor(candidate: RgbColor) {
  const hsl = rgbToHsl(candidate);
  return hslToRgb({
    h: hsl.h,
    s: Math.max(hsl.s, 0.45),
    l: clamp(hsl.l, 0.36, 0.56),
  });
}

function extractPaletteFromImage(image: HTMLImageElement): ReleasePalette {
  try {
    const canvas = document.createElement("canvas");
    const sampleSize = 48;
    canvas.width = sampleSize;
    canvas.height = sampleSize;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      return DEFAULT_PALETTE;
    }

    context.drawImage(image, 0, 0, sampleSize, sampleSize);
    const { data } = context.getImageData(0, 0, sampleSize, sampleSize);

    let totalRed = 0;
    let totalGreen = 0;
    let totalBlue = 0;
    let totalWeight = 0;
    let selectedAccent: RgbColor | null = null;
    let selectedAccentScore = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < data.length; index += 4) {
      const alpha = data[index + 3] ?? 0;
      if (alpha < 80) {
        continue;
      }

      const red = data[index] ?? 0;
      const green = data[index + 1] ?? 0;
      const blue = data[index + 2] ?? 0;
      const color = { r: red, g: green, b: blue };
      const hsl = rgbToHsl(color);
      const saturationWeight = 0.5 + hsl.s;

      totalRed += red * saturationWeight;
      totalGreen += green * saturationWeight;
      totalBlue += blue * saturationWeight;
      totalWeight += saturationWeight;

      const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
      const score = hsl.s * 1.7 - Math.abs(hsl.l - 0.47) * 0.8 + chroma / 255;
      if (score > selectedAccentScore) {
        selectedAccentScore = score;
        selectedAccent = color;
      }
    }

    if (!selectedAccent || totalWeight <= 0) {
      return DEFAULT_PALETTE;
    }

    const averageColor: RgbColor = {
      r: Math.round(totalRed / totalWeight),
      g: Math.round(totalGreen / totalWeight),
      b: Math.round(totalBlue / totalWeight),
    };

    const accent = normalizeAccentColor(selectedAccent);
    const accentHover = mixColor(accent, { r: 0, g: 0, b: 0 }, 0.16);
    const accentSoft = mixColor(accent, { r: 255, g: 255, b: 255 }, 0.46);
    const bgStart = mixColor(accent, { r: 255, g: 255, b: 255 }, 0.78);
    const bgMid = mixColor(averageColor, { r: 255, g: 255, b: 255 }, 0.84);
    const bgEnd = mixColor(accent, { r: 255, g: 255, b: 255 }, 0.93);
    const accentText = ensureMinimumTextContrast(accentHover, bgEnd);

    return {
      accent: rgbToCss(accent),
      accentHover: rgbToCss(accentHover),
      accentSoft: rgbToCss(accentSoft),
      accentContrast: resolveTextContrast(accent),
      accentText: rgbToCss(accentText),
      bgStart: rgbToCss(bgStart),
      bgMid: rgbToCss(bgMid),
      bgEnd: rgbToCss(bgEnd),
    };
  } catch {
    return DEFAULT_PALETTE;
  }
}

function isPalette(value: unknown): value is ReleasePalette {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ReleasePalette>;
  return (
    typeof candidate.accent === "string" &&
    typeof candidate.accentHover === "string" &&
    typeof candidate.accentSoft === "string" &&
    typeof candidate.accentContrast === "string" &&
    typeof candidate.accentText === "string" &&
    typeof candidate.bgStart === "string" &&
    typeof candidate.bgMid === "string" &&
    typeof candidate.bgEnd === "string"
  );
}

function readCachedPalette(coverSrc: string) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(`${PALETTE_CACHE_KEY_PREFIX}${coverSrc}`);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as unknown;
    return isPalette(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeCachedPalette(coverSrc: string, palette: ReleasePalette) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(`${PALETTE_CACHE_KEY_PREFIX}${coverSrc}`, JSON.stringify(palette));
  } catch {
    // Ignore storage failures; palette extraction still works without cache.
  }
}

function clearCachedPalette(coverSrc: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(`${PALETTE_CACHE_KEY_PREFIX}${coverSrc}`);
  } catch {
    // Ignore storage failures.
  }
}

function isSamePalette(a: ReleasePalette, b: ReleasePalette) {
  return (
    a.accent === b.accent &&
    a.accentHover === b.accentHover &&
    a.accentSoft === b.accentSoft &&
    a.accentContrast === b.accentContrast &&
    a.accentText === b.accentText &&
    a.bgStart === b.bgStart &&
    a.bgMid === b.bgMid &&
    a.bgEnd === b.bgEnd
  );
}

export default function ReleaseArtworkTheme({
  coverSrc,
  hasArtwork,
  children,
}: ReleaseArtworkThemeProps) {
  const [palette, setPalette] = useState<ReleasePalette>(DEFAULT_PALETTE);

  useEffect(() => {
    if (!hasArtwork) {
      return;
    }

    let active = true;
    let frameId = 0;
    const schedulePaletteUpdate = (nextPalette: ReleasePalette) => {
      frameId = window.requestAnimationFrame(() => {
        if (!active) {
          return;
        }
        setPalette(nextPalette);
      });
    };

    const cachedPalette = readCachedPalette(coverSrc);
    if (cachedPalette) {
      schedulePaletteUpdate(cachedPalette);
    } else {
      schedulePaletteUpdate(DEFAULT_PALETTE);
    }

    const image = new Image();
    image.decoding = "async";
    image.src = coverSrc;

    const applyPalette = () => {
      if (!active) {
        return;
      }
      const nextPalette = extractPaletteFromImage(image);
      schedulePaletteUpdate(nextPalette);
      if (!isSamePalette(nextPalette, DEFAULT_PALETTE)) {
        writeCachedPalette(coverSrc, nextPalette);
      } else {
        clearCachedPalette(coverSrc);
      }
    };

    image.onerror = () => {
      if (!active) {
        return;
      }
      schedulePaletteUpdate(DEFAULT_PALETTE);
      clearCachedPalette(coverSrc);
    };

    image.onload = applyPalette;
    image.crossOrigin = "anonymous";
    image.src = coverSrc;

    if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
      applyPalette();
    }

    return () => {
      active = false;
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [coverSrc, hasArtwork]);

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
