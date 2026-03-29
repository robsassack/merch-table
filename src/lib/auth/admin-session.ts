import crypto from "node:crypto";

const ADMIN_SESSION_COOKIE_NAME = "admin_session";
const ADMIN_SESSION_TTL_HOURS = 24 * 7;

type AdminSessionPayload = {
  expiresAt: number;
  userId: string;
  email: string;
  organizationId?: string;
};

function getSessionSecret() {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret) {
    throw new Error("AUTH_SECRET environment variable is required.");
  }

  return secret;
}

function signValue(value: string) {
  return crypto
    .createHmac("sha256", getSessionSecret())
    .update(value)
    .digest("base64url");
}

function encodePayload(payload: AdminSessionPayload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodePayload(value: string): AdminSessionPayload | null {
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as Partial<AdminSessionPayload>;
    if (
      typeof parsed.expiresAt !== "number" ||
      typeof parsed.userId !== "string" ||
      typeof parsed.email !== "string"
    ) {
      return null;
    }

    if (
      parsed.organizationId !== undefined &&
      typeof parsed.organizationId !== "string"
    ) {
      return null;
    }

    return {
      expiresAt: parsed.expiresAt,
      userId: parsed.userId,
      email: parsed.email,
      organizationId: parsed.organizationId,
    };
  } catch {
    return null;
  }
}

export function createAdminSessionCookieValue(input: {
  userId: string;
  email: string;
  organizationId: string;
}) {
  const expiresAt = Date.now() + ADMIN_SESSION_TTL_HOURS * 60 * 60 * 1_000;
  const payload: AdminSessionPayload = {
    expiresAt,
    userId: input.userId,
    email: input.email,
    organizationId: input.organizationId,
  };
  const encodedPayload = encodePayload(payload);
  const signature = signValue(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function readAdminSession(
  cookieStore: { get: (name: string) => { value: string } | undefined },
) {
  const value = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  if (!value) {
    return null;
  }

  const [encodedPayload, signature] = value.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signValue(encodedPayload);
  try {
    if (
      !crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature),
      )
    ) {
      return null;
    }
  } catch {
    return null;
  }

  const payload = decodePayload(encodedPayload);
  if (!payload || payload.expiresAt <= Date.now()) {
    return null;
  }

  return payload;
}

export function hasValidAdminSession(
  cookieStore: { get: (name: string) => { value: string } | undefined },
) {
  return readAdminSession(cookieStore) !== null;
}

export function getAdminSessionCookieName() {
  return ADMIN_SESSION_COOKIE_NAME;
}

export function getAdminSessionTtlSeconds() {
  return ADMIN_SESSION_TTL_HOURS * 60 * 60;
}
