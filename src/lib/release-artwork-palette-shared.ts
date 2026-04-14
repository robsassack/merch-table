export type ReleasePalette = {
  accent: string;
  accentHover: string;
  accentSoft: string;
  accentContrast: string;
  accentText: string;
  bgStart: string;
  bgMid: string;
  bgEnd: string;
};

export type ReleasePaletteRecord = {
  palette: ReleasePalette;
  coverKey: string | null;
};

const RELEASE_PALETTE_KEYS = [
  "accent",
  "accentHover",
  "accentSoft",
  "accentContrast",
  "accentText",
  "bgStart",
  "bgMid",
  "bgEnd",
] as const satisfies ReadonlyArray<keyof ReleasePalette>;

const RELEASE_PALETTE_COVER_KEY_VERSION = "v2";

function normalizeReleasePaletteCoverKey(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

function versionReleasePaletteCoverKey(value: string) {
  if (value.startsWith(`${RELEASE_PALETTE_COVER_KEY_VERSION}|`)) {
    return value;
  }

  return `${RELEASE_PALETTE_COVER_KEY_VERSION}|${value}`;
}

export function resolveReleasePaletteCoverKey(value: string | null | undefined) {
  const normalized = normalizeReleasePaletteCoverKey(value);
  if (!normalized) {
    return null;
  }

  return versionReleasePaletteCoverKey(normalized);
}

function isReleasePalette(value: unknown): value is ReleasePalette {
  if (!value || typeof value !== "object") {
    return false;
  }

  for (const key of RELEASE_PALETTE_KEYS) {
    const entry = (value as Record<string, unknown>)[key];
    if (typeof entry !== "string" || entry.trim().length === 0) {
      return false;
    }
  }

  return true;
}

export function parseReleasePaletteRecord(value: string | null | undefined) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (isReleasePalette(parsed)) {
      return { palette: parsed, coverKey: null } satisfies ReleasePaletteRecord;
    }

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const envelope = parsed as {
      palette?: unknown;
      coverKey?: unknown;
    };

    if (!isReleasePalette(envelope.palette)) {
      return null;
    }

    return {
      palette: envelope.palette,
      coverKey:
        typeof envelope.coverKey === "string" ? normalizeReleasePaletteCoverKey(envelope.coverKey) : null,
    } satisfies ReleasePaletteRecord;
  } catch {
    return null;
  }
}

export function parseReleasePaletteJson(value: string | null | undefined) {
  return parseReleasePaletteRecord(value)?.palette ?? null;
}

export function serializeReleasePaletteJson(palette: ReleasePalette | null | undefined) {
  if (!palette) {
    return null;
  }

  return JSON.stringify(palette);
}

export function serializeReleasePaletteRecord(record: {
  palette: ReleasePalette | null | undefined;
  coverKey?: string | null;
}) {
  if (!record.palette) {
    return null;
  }

  const coverKey = normalizeReleasePaletteCoverKey(record.coverKey);
  if (!coverKey) {
    return JSON.stringify(record.palette);
  }

  return JSON.stringify({
    palette: record.palette,
    coverKey,
  });
}

export const DEFAULT_PALETTE: ReleasePalette = {
  accent: "rgb(51 65 85)",
  accentHover: "rgb(30 41 59)",
  accentSoft: "rgb(203 213 225)",
  accentContrast: "rgb(255 255 255)",
  accentText: "rgb(30 41 59)",
  bgStart: "rgb(232 238 247)",
  bgMid: "rgb(226 236 255)",
  bgEnd: "rgb(245 248 252)",
};

export const BRAND_FALLBACK_PALETTE: ReleasePalette = {
  accent: "rgb(16 185 129)",
  accentHover: "rgb(5 150 105)",
  accentSoft: "rgb(110 231 183)",
  accentContrast: "rgb(255 255 255)",
  accentText: "rgb(5 150 105)",
  bgStart: "rgb(221 245 234)",
  bgMid: "rgb(226 236 255)",
  bgEnd: "rgb(248 251 250)",
};
