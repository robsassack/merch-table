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

export const authRateLimitPolicies = {
  requestLinkByIp: readPolicy(
    "admin-auth-request-link-ip",
    { maxRequests: 10, windowSeconds: 900 },
    "RATE_LIMIT_ADMIN_AUTH_REQUEST_IP",
  ),
  requestLinkByEmail: readPolicy(
    "admin-auth-request-link-email",
    { maxRequests: 3, windowSeconds: 900 },
    "RATE_LIMIT_ADMIN_AUTH_REQUEST_EMAIL",
  ),
  consumeLinkByIp: readPolicy(
    "admin-auth-consume-link-ip",
    { maxRequests: 30, windowSeconds: 900 },
    "RATE_LIMIT_ADMIN_AUTH_CONSUME_IP",
  ),
};

