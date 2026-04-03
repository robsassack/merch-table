import { serializeSignedCookie } from "better-call";

type SupportedSameSite =
  | "Strict"
  | "Lax"
  | "None"
  | "strict"
  | "lax"
  | "none"
  | undefined;

type SessionCookieAttributes = {
  secure?: boolean;
  sameSite?: SupportedSameSite;
  path?: string;
  httpOnly?: boolean;
  maxAge?: number;
  domain?: string;
  expires?: Date;
};

type SessionTokenCookieDefinition = {
  name: string;
  attributes: SessionCookieAttributes;
};

export function normalizeSameSite(value: SupportedSameSite) {
  if (!value) {
    return "lax" as const;
  }

  const lowered = value.toLowerCase();
  if (lowered === "strict") {
    return "strict" as const;
  }
  if (lowered === "none") {
    return "none" as const;
  }
  return "lax" as const;
}

export async function serializeSignedSessionTokenCookie(input: {
  token: string;
  secret: string;
  cookie: SessionTokenCookieDefinition;
}) {
  return serializeSignedCookie(
    input.cookie.name,
    input.token,
    input.secret,
    {
      ...input.cookie.attributes,
      sameSite: normalizeSameSite(input.cookie.attributes.sameSite),
    },
  );
}

export function parseSignedCookieValue(cookieValue: string | null | undefined) {
  if (!cookieValue) {
    return null;
  }

  const signatureSeparator = cookieValue.lastIndexOf(".");
  if (signatureSeparator < 1) {
    return null;
  }

  const signedValue = cookieValue.slice(0, signatureSeparator);
  const signature = cookieValue.slice(signatureSeparator + 1);
  if (signature.length !== 44 || !signature.endsWith("=")) {
    return null;
  }

  return {
    signedValue,
    signature,
  };
}
