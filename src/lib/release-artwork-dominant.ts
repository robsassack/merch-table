type RgbColor = {
  r: number;
  g: number;
  b: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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

function resolveChroma(color: RgbColor) {
  return Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b);
}

function scoreColor(color: RgbColor) {
  const hsl = rgbToHsl(color);
  const hueDegrees = hsl.h * 360;
  const chroma = resolveChroma(color) / 255;
  const saturationScore = hsl.s * 30;
  const lightnessScore = 1 - Math.abs(hsl.l - 0.5);
  const chromaScore = chroma * 28;
  const greenHueBonus = hueDegrees >= 70 && hueDegrees <= 170 ? 12 : 0;

  return (
    saturationScore +
    chromaScore +
    lightnessScore * 18 +
    greenHueBonus +
    clamp((color.g - Math.max(color.r, color.b)) / 255, -0.25, 0.45) * 10
  );
}

export function pickDominantArtworkColor(colors: RgbColor[]) {
  if (!Array.isArray(colors) || colors.length === 0) {
    return null;
  }

  let best: RgbColor | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const color of colors) {
    if (
      !color ||
      !Number.isFinite(color.r) ||
      !Number.isFinite(color.g) ||
      !Number.isFinite(color.b)
    ) {
      continue;
    }

    const candidate = {
      r: Math.round(clamp(color.r, 0, 255)),
      g: Math.round(clamp(color.g, 0, 255)),
      b: Math.round(clamp(color.b, 0, 255)),
    };
    const score = scoreColor(candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}
