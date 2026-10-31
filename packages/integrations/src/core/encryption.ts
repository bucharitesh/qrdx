import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const LEGACY_ALGORITHM = "aes-256-cbc";
const VERSION_PREFIX = "v2";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const DEV_FALLBACK_KEY = "dev-only-key-change-in-production";

/**
 * Get the encryption secret from the environment.
 * Falls back to a fixed key only outside production.
 */
function getEncryptionSecret(): string {
  const key = process.env.INTEGRATION_ENCRYPTION_KEY;

  if (key) {
    return key;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("INTEGRATION_ENCRYPTION_KEY must be set in production");
  }

  console.warn(
    "INTEGRATION_ENCRYPTION_KEY not set. Using default development key. DO NOT use in production!"
  );
  return DEV_FALLBACK_KEY;
}

function getKey(): Buffer {
  return crypto.createHash("sha256").update(getEncryptionSecret()).digest();
}

// Pre-v2 values: AES-256-CBC keyed with the secret's first 32 chars
function getLegacyKey(): Buffer {
  return Buffer.from(getEncryptionSecret().padEnd(32, "0").slice(0, 32));
}

/**
 * Encrypt sensitive data (tokens, API keys) with AES-256-GCM.
 * Format: `v2:<iv>:<authTag>:<ciphertext>` (hex)
 */
export function encryptApiKey(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  const encrypted = Buffer.concat([
    cipher.update(text, "utf8"),
    cipher.final(),
  ]);
  return [
    VERSION_PREFIX,
    iv.toString("hex"),
    cipher.getAuthTag().toString("hex"),
    encrypted.toString("hex"),
  ].join(":");
}

/**
 * Decrypt sensitive data (tokens, API keys).
 * Also reads legacy `<iv>:<ciphertext>` AES-256-CBC values.
 */
export function decryptApiKey(text: string): string {
  if (text.startsWith(`${VERSION_PREFIX}:`)) {
    const [, ivHex, tagHex, dataHex] = text.split(":");
    if (!(ivHex && tagHex) || dataHex === undefined) {
      throw new Error("Invalid encrypted text format");
    }
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      getKey(),
      Buffer.from(ivHex, "hex"),
      { authTagLength: AUTH_TAG_LENGTH }
    );
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataHex, "hex")),
      decipher.final(),
    ]).toString("utf8");
  }

  const parts = text.split(":");
  const ivPart = parts.shift();
  if (!ivPart) throw new Error("Invalid encrypted text format");
  const iv = Buffer.from(ivPart, "hex");
  const encryptedText = parts.join(":");
  const decipher = crypto.createDecipheriv(
    LEGACY_ALGORITHM,
    getLegacyKey(),
    iv
  );
  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
