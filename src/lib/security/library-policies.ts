import type { RateLimitPolicy } from "@/lib/security/rate-limit";

function readIntegerEnv(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

function readPolicy(
  id: string,
  defaults: { maxRequests: number; windowSeconds: number },
  envPrefix: string,
): RateLimitPolicy {
  const maxRequests = readIntegerEnv(
    `${envPrefix}_MAX`,
    defaults.maxRequests,
  );
  const windowSeconds = readIntegerEnv(
    `${envPrefix}_WINDOW_SECONDS`,
    defaults.windowSeconds,
  );

  return {
    id,
    maxRequests,
    windowMs: windowSeconds * 1_000,
  };
}

export const libraryRateLimitPolicies = {
  download: readPolicy(
    "library-download",
    { maxRequests: 120, windowSeconds: 3_600 },
    "RATE_LIMIT_DOWNLOAD",
  ),
  resendByIp: readPolicy(
    "library-resend-ip",
    { maxRequests: 5, windowSeconds: 3_600 },
    "RATE_LIMIT_LIBRARY_RESEND",
  ),
  resendByEmail: readPolicy(
    "library-resend-email",
    { maxRequests: 2, windowSeconds: 3_600 },
    "RATE_LIMIT_LIBRARY_RESEND_EMAIL",
  ),
};
