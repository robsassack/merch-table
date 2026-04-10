const SAFE_ABSOLUTE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

export function toSafeMarkdownHref(value: string): string | null {
  const candidate = value.trim();
  if (candidate.length === 0 || candidate.startsWith("//")) {
    return null;
  }

  if (candidate.startsWith("/") || candidate.startsWith("#")) {
    return candidate;
  }

  try {
    const parsed = new URL(candidate);
    if (!SAFE_ABSOLUTE_PROTOCOLS.has(parsed.protocol)) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}
