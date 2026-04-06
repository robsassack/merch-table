import crypto from "node:crypto";

export const OWNED_RELEASE_HINT_COOKIE_NAME = "mt_owned_release_hint";
export const OWNED_RELEASE_HINT_COOKIE_TTL_SECONDS = 60 * 60 * 24;

type OwnedReleaseHintPayload = {
  exp: number;
  releaseIds: string[];
};

function getCookieSecret() {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret) {
    return null;
  }
  return secret;
}

function signValue(value: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function normalizeReleaseIds(releaseIds: string[]) {
  const unique = new Set<string>();
  for (const releaseId of releaseIds) {
    const normalized = releaseId.trim();
    if (normalized.length === 0) {
      continue;
    }
    unique.add(normalized);
    if (unique.size >= 256) {
      break;
    }
  }
  return Array.from(unique);
}

export function createOwnedReleaseHintCookieValue(releaseIds: string[]) {
  const secret = getCookieSecret();
  if (!secret) {
    return null;
  }

  const normalizedReleaseIds = normalizeReleaseIds(releaseIds);
  if (normalizedReleaseIds.length === 0) {
    return null;
  }

  const payload: OwnedReleaseHintPayload = {
    exp: Date.now() + OWNED_RELEASE_HINT_COOKIE_TTL_SECONDS * 1_000,
    releaseIds: normalizedReleaseIds,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  const signature = signValue(encodedPayload, secret);

  return `${encodedPayload}.${signature}`;
}

export function parseOwnedReleaseHintCookieValue(raw: string | null | undefined) {
  if (!raw) {
    return null;
  }

  const dotIndex = raw.lastIndexOf(".");
  if (dotIndex < 1) {
    return null;
  }

  const encodedPayload = raw.slice(0, dotIndex);
  const signature = raw.slice(dotIndex + 1);
  const secret = getCookieSecret();
  if (!secret) {
    return null;
  }

  const expectedSignature = signValue(encodedPayload, secret);

  try {
    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature),
    );
    if (!isValid) {
      return null;
    }
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as unknown;
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const payload = parsed as Partial<OwnedReleaseHintPayload>;
  if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) {
    return null;
  }
  if (payload.exp <= Date.now()) {
    return null;
  }
  if (!Array.isArray(payload.releaseIds)) {
    return null;
  }

  return normalizeReleaseIds(
    payload.releaseIds.filter((value): value is string => typeof value === "string"),
  );
}

export function hasOwnedReleaseHintFromCookieStore(
  cookieStore: { get: (name: string) => { value: string } | undefined },
  releaseId: string,
) {
  const normalizedReleaseId = releaseId.trim();
  if (normalizedReleaseId.length === 0) {
    return false;
  }

  const cookieValue = cookieStore.get(OWNED_RELEASE_HINT_COOKIE_NAME)?.value;
  const releaseIds = parseOwnedReleaseHintCookieValue(cookieValue);
  if (!releaseIds) {
    return false;
  }

  return releaseIds.includes(normalizedReleaseId);
}
