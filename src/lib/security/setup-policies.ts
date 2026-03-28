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

export const setupRateLimitPolicies = {
  claimToken: readPolicy(
    "setup-claim-token",
    { maxRequests: 20, windowSeconds: 900 },
    "RATE_LIMIT_SETUP_CLAIM",
  ),
  saveStep: readPolicy(
    "setup-save-step",
    { maxRequests: 120, windowSeconds: 600 },
    "RATE_LIMIT_SETUP_SAVE",
  ),
  verifySmtp: readPolicy(
    "setup-verify-smtp",
    { maxRequests: 10, windowSeconds: 900 },
    "RATE_LIMIT_SETUP_VERIFY_SMTP",
  ),
  verifyStorage: readPolicy(
    "setup-verify-storage",
    { maxRequests: 20, windowSeconds: 900 },
    "RATE_LIMIT_SETUP_VERIFY_STORAGE",
  ),
  verifyStripe: readPolicy(
    "setup-verify-stripe",
    { maxRequests: 20, windowSeconds: 900 },
    "RATE_LIMIT_SETUP_VERIFY_STRIPE",
  ),
  sendAdminMagicLink: readPolicy(
    "setup-send-admin-magic-link",
    { maxRequests: 10, windowSeconds: 900 },
    "RATE_LIMIT_SETUP_ADMIN_MAGIC_LINK",
  ),
};
