import type { ReleasePalette } from "@/lib/release-artwork-palette-shared";

export type RgbColor = {
  r: number;
  g: number;
  b: number;
};

type HslColor = {
  h: number;
  s: number;
  l: number;
};

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
    t += 1;
  }
  if (t > 1) {
    t -= 1;
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

export function buildPaletteFromDominant(dominant: RgbColor): ReleasePalette {
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
