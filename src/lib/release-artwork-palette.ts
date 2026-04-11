import sharp from "sharp";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import {
  DEFAULT_PALETTE,
  type ReleasePalette,
} from "@/lib/release-artwork-palette-shared";
import { getStorageAdapterFromEnv } from "@/lib/storage/adapter";
import { extractStorageKeyFromCoverImageUrl } from "@/lib/storage/cover-art";

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

type ColorBucketAccumulator = {
  weightedRed: number;
  weightedGreen: number;
  weightedBlue: number;
  weight: number;
  pixelCount: number;
};

type ResolvedBucket = {
  color: RgbColor;
  weight: number;
  pixelCount: number;
};

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
    s: clamp(hsl.s, 0.34, 0.72),
    l: clamp(hsl.l, 0.34, 0.52),
  });
}

function quantizeChannel(value: number, levels: number) {
  const safeLevels = Math.max(2, Math.floor(levels));
  const step = 255 / (safeLevels - 1);
  return Math.round(clamp(value, 0, 255) / step) * step;
}

function resolveChroma(color: RgbColor) {
  return Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b);
}

function resolveBucketColor(bucket: ColorBucketAccumulator): RgbColor {
  return {
    r: Math.round(bucket.weightedRed / bucket.weight),
    g: Math.round(bucket.weightedGreen / bucket.weight),
    b: Math.round(bucket.weightedBlue / bucket.weight),
  };
}

function selectDominantBucket(resolvedBuckets: ResolvedBucket[]) {
  let selected: ResolvedBucket | null = null;
  for (const bucket of resolvedBuckets) {
    if (!selected) {
      selected = bucket;
      continue;
    }
    if (bucket.pixelCount > selected.pixelCount) {
      selected = bucket;
      continue;
    }
    if (bucket.pixelCount === selected.pixelCount && bucket.weight > selected.weight) {
      selected = bucket;
    }
  }
  return selected;
}

function selectDominantChromaticBucket(resolvedBuckets: ResolvedBucket[]) {
  let selected: ResolvedBucket | null = null;
  let selectedScore = Number.NEGATIVE_INFINITY;

  for (const bucket of resolvedBuckets) {
    const hsl = rgbToHsl(bucket.color);
    const chroma = resolveChroma(bucket.color);
    if (hsl.s < 0.2 || chroma < 26) {
      continue;
    }

    const chromaNormalized = chroma / 255;
    const score =
      bucket.pixelCount * 1.2 +
      bucket.weight * 0.45 +
      hsl.s * 18 +
      chromaNormalized * 16 -
      Math.abs(hsl.l - 0.5) * 10;

    if (score > selectedScore) {
      selectedScore = score;
      selected = bucket;
    }
  }

  return selected;
}

function extractPaletteFromRawPixels(
  data: Uint8Array,
  channels: number,
  width: number,
  height: number,
): ReleasePalette {
  let totalRed = 0;
  let totalGreen = 0;
  let totalBlue = 0;
  let totalWeight = 0;
  let consideredPixels = 0;
  const buckets = new Map<string, ColorBucketAccumulator>();

  for (let index = 0; index < data.length; index += channels) {
    const pixelNumber = Math.floor(index / channels);
    const x = pixelNumber % width;
    const y = Math.floor(pixelNumber / width);
    const normalizedX = width <= 1 ? 0.5 : x / (width - 1);
    const normalizedY = height <= 1 ? 0.5 : y / (height - 1);
    const distanceToCenter = Math.hypot(normalizedX - 0.5, normalizedY - 0.5) / 0.7072;
    const centerWeight = 1 - clamp(distanceToCenter, 0, 1) * 0.42;

    const red = data[index] ?? 0;
    const green = data[index + 1] ?? 0;
    const blue = data[index + 2] ?? 0;
    const alpha = channels > 3 ? (data[index + 3] ?? 255) : 255;
    if (alpha < 80) {
      continue;
    }

    const color = { r: red, g: green, b: blue };
    const hsl = rgbToHsl(color);
    const alphaWeight = alpha / 255;
    const saturationWeight = 0.25 + hsl.s;
    const lightnessBalanceWeight = 1 - Math.abs(hsl.l - 0.5) * 0.65;
    const weight = alphaWeight * saturationWeight * lightnessBalanceWeight * centerWeight;
    if (weight <= 0) {
      continue;
    }

    totalRed += red * weight;
    totalGreen += green * weight;
    totalBlue += blue * weight;
    totalWeight += weight;
    consideredPixels += 1;

    const bucketKey = `${quantizeChannel(red, 8)}:${quantizeChannel(green, 8)}:${quantizeChannel(blue, 8)}`;
    const existingBucket = buckets.get(bucketKey);
    if (existingBucket) {
      existingBucket.weightedRed += red * weight;
      existingBucket.weightedGreen += green * weight;
      existingBucket.weightedBlue += blue * weight;
      existingBucket.weight += weight;
      existingBucket.pixelCount += 1;
    } else {
      buckets.set(bucketKey, {
        weightedRed: red * weight,
        weightedGreen: green * weight,
        weightedBlue: blue * weight,
        weight,
        pixelCount: 1,
      });
    }
  }

  if (totalWeight <= 0 || consideredPixels === 0 || buckets.size === 0) {
    return DEFAULT_PALETTE;
  }

  const averageColor: RgbColor = {
    r: Math.round(totalRed / totalWeight),
    g: Math.round(totalGreen / totalWeight),
    b: Math.round(totalBlue / totalWeight),
  };

  const resolvedBuckets: ResolvedBucket[] = [];
  for (const bucket of buckets.values()) {
    if (bucket.weight <= 0) {
      continue;
    }
    resolvedBuckets.push({
      color: resolveBucketColor(bucket),
      weight: bucket.weight,
      pixelCount: bucket.pixelCount,
    });
  }

  if (resolvedBuckets.length === 0) {
    return DEFAULT_PALETTE;
  }

  const dominantBucket = selectDominantBucket(resolvedBuckets);
  const dominantChromaticBucket =
    selectDominantChromaticBucket(resolvedBuckets) ?? dominantBucket;
  if (!dominantBucket || !dominantChromaticBucket) {
    return DEFAULT_PALETTE;
  }

  const accent = normalizeAccentColor(
    mixColor(dominantChromaticBucket.color, dominantBucket.color, 0.18),
  );
  const dominantBackground = dominantBucket.color;
  const accentHover = mixColor(accent, { r: 0, g: 0, b: 0 }, 0.16);
  const accentSoft = mixColor(accent, { r: 255, g: 255, b: 255 }, 0.46);
  const bgStart = mixColor(dominantBackground, { r: 255, g: 255, b: 255 }, 0.76);
  const bgMid = mixColor(averageColor, { r: 255, g: 255, b: 255 }, 0.84);
  const bgEnd = mixColor(dominantBackground, { r: 255, g: 255, b: 255 }, 0.92);
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
}

async function extractPaletteFromImageBuffer(imageBuffer: Buffer): Promise<ReleasePalette> {
  const sampleSize = 48;
  const { data, info } = await sharp(imageBuffer)
    .rotate()
    .ensureAlpha()
    .resize(sampleSize, sampleSize, { fit: "cover" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (!info.channels || info.channels < 3) {
    return DEFAULT_PALETTE;
  }

  return extractPaletteFromRawPixels(data, info.channels, info.width, info.height);
}

async function resolveArtworkBufferFromStorageUrl(coverImageUrl: string) {
  const storageKey = resolveStorageKeyForPalette(coverImageUrl);
  if (!storageKey) {
    return null;
  }

  const storage = getStorageAdapterFromEnv();
  const object = await storage.getClient().send(
    new GetObjectCommand({
      Bucket: storage.bucket,
      Key: storageKey,
    }),
  );
  const body = object.Body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined;
  const bytes = await body?.transformToByteArray?.();
  if (!bytes || bytes.length === 0) {
    return null;
  }
  return Buffer.from(bytes);
}

function resolveStorageKeyForPalette(coverImageUrl: string) {
  const strictKey = extractStorageKeyFromCoverImageUrl(coverImageUrl);
  if (strictKey) {
    return strictKey;
  }

  // Fallback for environments where public URL host/base differs from app env.
  // We only accept known cover prefixes to avoid arbitrary key reads.
  try {
    const parsed = new URL(coverImageUrl);
    const path = decodeURIComponent(parsed.pathname).replace(/^\/+/, "");
    const marker = "admin/covers/";
    const markerIndex = path.indexOf(marker);
    if (markerIndex >= 0) {
      const candidate = path.slice(markerIndex);
      if (/^admin\/covers\/[A-Za-z0-9/_\-.]+$/.test(candidate)) {
        return candidate;
      }
    }
  } catch {
    return null;
  }

  return null;
}

export async function resolveReleasePaletteFromArtworkUrl(
  coverImageUrl: string | null,
): Promise<ReleasePalette | null> {
  if (!coverImageUrl || coverImageUrl.trim().length === 0) {
    return null;
  }

  try {
    const storageBuffer = await resolveArtworkBufferFromStorageUrl(coverImageUrl);
    if (storageBuffer) {
      return await extractPaletteFromImageBuffer(storageBuffer);
    }

    const parsed = new URL(coverImageUrl);
    if (!/^https?:$/.test(parsed.protocol)) {
      return null;
    }

    const response = await fetch(parsed.toString(), {
      signal: AbortSignal.timeout(4_000),
      next: { revalidate: 86_400 },
    });
    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("image/")) {
      return null;
    }

    const imageBuffer = Buffer.from(await response.arrayBuffer());
    if (imageBuffer.length === 0) {
      return null;
    }

    return await extractPaletteFromImageBuffer(imageBuffer);
  } catch {
    return null;
  }
}
