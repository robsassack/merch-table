import crypto from "node:crypto";

const SETUP_SESSION_COOKIE_NAME = "setup_wizard_access";
const SETUP_SESSION_TTL_HOURS = 2;

function getSessionSecret() {
  return process.env.AUTH_SECRET ?? "dev-setup-session-secret";
}

function signValue(value: string) {
  return crypto
    .createHmac("sha256", getSessionSecret())
    .update(value)
    .digest("base64url");
}

export function createSetupSessionCookieValue() {
  const expiresAt = Date.now() + SETUP_SESSION_TTL_HOURS * 60 * 60 * 1_000;
  const nonce = crypto.randomBytes(12).toString("base64url");
  const payload = `${expiresAt}.${nonce}`;
  const signature = signValue(payload);

  return `${payload}.${signature}`;
}

export function hasValidSetupSession(
  cookieStore: { get: (name: string) => { value: string } | undefined },
) {
  const value = cookieStore.get(SETUP_SESSION_COOKIE_NAME)?.value;

  if (!value) {
    return false;
  }

  const [expiresAtRaw, nonce, signature] = value.split(".");

  if (!expiresAtRaw || !nonce || !signature) {
    return false;
  }

  const payload = `${expiresAtRaw}.${nonce}`;
  const expectedSignature = signValue(payload);
  const parsedExpiresAt = Number(expiresAtRaw);

  if (!Number.isFinite(parsedExpiresAt) || parsedExpiresAt <= Date.now()) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature),
    );
  } catch {
    return false;
  }
}

export function getSetupSessionCookieName() {
  return SETUP_SESSION_COOKIE_NAME;
}

export function getSetupSessionTtlSeconds() {
  return SETUP_SESSION_TTL_HOURS * 60 * 60;
}
