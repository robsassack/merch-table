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

export const adminRateLimitPolicies = {
  uploadUrl: readPolicy(
    "admin-upload-url",
    { maxRequests: 60, windowSeconds: 3600 },
    "RATE_LIMIT_UPLOAD_URL",
  ),
};
