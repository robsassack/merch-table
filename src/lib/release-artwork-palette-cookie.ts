import {
  parseReleasePaletteJson,
  resolveReleasePaletteCoverKey,
  type ReleasePalette,
} from "@/lib/release-artwork-palette-shared";

export const RELEASE_ARTWORK_PALETTE_COOKIE_NAME = "release_artwork_palette";

type SerializedReleaseArtworkPaletteCookie = {
  coverSrc: string;
  coverKey: string;
  palette: ReleasePalette;
};

function normalizeCoverAssetUrl(value: string) {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return "";
  }

  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

function resolveCoverKey(coverSrc: string) {
  const trimmed = coverSrc.trim();
  if (trimmed.length === 0) {
    return null;
  }

  try {
    const parsed = new URL(trimmed, "http://localhost");
    if (parsed.pathname !== "/api/cover") {
      return resolveReleasePaletteCoverKey(trimmed);
    }

    const sourceUrl = normalizeCoverAssetUrl(parsed.searchParams.get("url") ?? "");
    const version = (parsed.searchParams.get("v") ?? "").trim();
    return resolveReleasePaletteCoverKey(`${parsed.pathname}|${sourceUrl}|${version}`);
  } catch {
    return resolveReleasePaletteCoverKey(trimmed);
  }
}

export function serializeReleaseArtworkPaletteCookie(input: {
  coverSrc: string;
  palette: ReleasePalette;
}) {
  const coverSrc = input.coverSrc.trim();
  const coverKey = resolveCoverKey(coverSrc);
  if (coverSrc.length === 0 || !coverKey) {
    return null;
  }

  const payload: SerializedReleaseArtworkPaletteCookie = {
    coverSrc,
    coverKey,
    palette: input.palette,
  };

  return encodeURIComponent(JSON.stringify(payload));
}

export function parseReleaseArtworkPaletteCookie(
  cookieValue: string | null | undefined,
  expectedCoverSrc: string,
) {
  if (typeof cookieValue !== "string" || cookieValue.trim().length === 0) {
    return null;
  }

  const coverSrc = expectedCoverSrc.trim();
  const expectedCoverKey = resolveCoverKey(coverSrc);
  if (coverSrc.length === 0 || !expectedCoverKey) {
    return null;
  }

  const candidateValues = [cookieValue];
  try {
    const decoded = decodeURIComponent(cookieValue);
    if (decoded !== cookieValue) {
      candidateValues.push(decoded);
    }
  } catch {
    // Keep raw candidate only.
  }

  for (const candidate of candidateValues) {
    try {
      const parsed = JSON.parse(candidate) as Partial<SerializedReleaseArtworkPaletteCookie>;
      if (!parsed.palette) {
        continue;
      }

      const parsedCoverKey =
        typeof parsed.coverKey === "string" && parsed.coverKey.trim().length > 0
          ? parsed.coverKey
          : typeof parsed.coverSrc === "string"
            ? resolveCoverKey(parsed.coverSrc)
            : null;
      if (parsedCoverKey !== expectedCoverKey) {
        continue;
      }

      const parsedPalette = parseReleasePaletteJson(JSON.stringify(parsed.palette));
      if (parsedPalette) {
        return parsedPalette;
      }
    } catch {
      // Try next candidate form.
    }
  }

  return null;
}
