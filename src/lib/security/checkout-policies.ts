type RateLimitPolicyConfig = {
  id: string;
  maxRequests: number;
  windowMs: number;
};

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
): RateLimitPolicyConfig {
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

export const checkoutRateLimitPolicies = {
  session: readPolicy(
    "checkout-session",
    { maxRequests: 30, windowSeconds: 3_600 },
    "RATE_LIMIT_CHECKOUT_SESSION",
  ),
  freeByIp: readPolicy(
    "checkout-free-ip",
    { maxRequests: 5, windowSeconds: 3_600 },
    "RATE_LIMIT_FREE_CHECKOUT",
  ),
  freeByEmail: readPolicy(
    "checkout-free-email",
    { maxRequests: 2, windowSeconds: 3_600 },
    "RATE_LIMIT_FREE_CHECKOUT_EMAIL",
  ),
};
