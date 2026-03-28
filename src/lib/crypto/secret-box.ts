import crypto from "node:crypto";

const ENCRYPTION_PREFIX = "enc:v1";
const IV_LENGTH_BYTES = 12;

function getEncryptionKey() {
  const raw = process.env.APP_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error(
      "APP_ENCRYPTION_KEY is required to encrypt setup secrets.",
    );
  }

  const base64UrlCandidate = raw.replace(/-/g, "+").replace(/_/g, "/");
  const decodeCandidates = [
    () => Buffer.from(base64UrlCandidate, "base64"),
    () => Buffer.from(raw, "hex"),
    () => Buffer.from(raw, "utf8"),
  ];

  for (const decode of decodeCandidates) {
    try {
      const decoded = decode();
      if (decoded.length === 32) {
        return decoded;
      }
    } catch {
      // Try next decoder.
    }
  }

  throw new Error(
    "APP_ENCRYPTION_KEY must decode to 32 bytes (AES-256 key).",
  );
}

function looksEncrypted(value: string) {
  return value.startsWith(`${ENCRYPTION_PREFIX}:`);
}

export function encryptSecret(plaintext: string | null | undefined) {
  if (!plaintext) {
    return null;
  }

  if (looksEncrypted(plaintext)) {
    return plaintext;
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${ENCRYPTION_PREFIX}:${iv.toString("base64url")}:${authTag.toString(
    "base64url",
  )}:${ciphertext.toString("base64url")}`;
}

export function decryptSecret(ciphertext: string | null | undefined) {
  if (!ciphertext) {
    return null;
  }

  if (!looksEncrypted(ciphertext)) {
    return ciphertext;
  }

  const key = getEncryptionKey();
  const parts = ciphertext.split(":");
  if (parts.length !== 5) {
    throw new Error("Encrypted secret format is invalid.");
  }

  const iv = Buffer.from(parts[2], "base64url");
  const authTag = Buffer.from(parts[3], "base64url");
  const encrypted = Buffer.from(parts[4], "base64url");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return plaintext.toString("utf8");
}
