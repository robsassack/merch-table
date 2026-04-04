const DEFAULT_APP_BASE_URL = "http://localhost:3000";

export function readBuyerLibraryTokenTtlSecondsFromEnv() {
  const raw = process.env.BUYER_LIBRARY_TOKEN_TTL_SECONDS?.trim();
  if (!raw) {
    return null;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.floor(parsed);
}

export function createBuyerLibraryTokenExpiresAt(now: Date) {
  const tokenTtlSeconds = readBuyerLibraryTokenTtlSecondsFromEnv();
  if (tokenTtlSeconds === null) {
    return null;
  }

  return new Date(now.getTime() + tokenTtlSeconds * 1_000);
}

export function buildLibraryMagicLinkUrl(token: string) {
  const appBaseUrl = process.env.APP_BASE_URL ?? DEFAULT_APP_BASE_URL;
  const normalized = appBaseUrl.endsWith("/")
    ? appBaseUrl.slice(0, -1)
    : appBaseUrl;

  // Keep token out of referrers by using a fragment.
  return `${normalized}/library#token=${encodeURIComponent(token)}`;
}
