import crypto from "node:crypto";

/**
 * Get encryption key from environment
 * Falls back to a default key for development (DO NOT use in production)
 */
function getEncryptionKey(): string {
  const key =
    process.env.INTEGRATION_ENCRYPTION_KEY ||
    process.env.NEXT_PUBLIC_INTEGRATION_ENCRYPTION_KEY;

  if (!key) {
    console.warn(
      "INTEGRATION_ENCRYPTION_KEY not set. Using default development key. DO NOT use in production!"
    );
    return "dev-only-key-change-in-production";
  }

  return key;
}

/**
 * Encrypt sensitive data (tokens, API keys)
 */
export function encryptApiKey(text: string): string {
  const algorithm = "aes-256-cbc";
  const key = Buffer.from(getEncryptionKey().padEnd(32, "0").slice(0, 32));
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return `${iv.toString("hex")}:${encrypted}`;
}

/**
 * Decrypt sensitive data (tokens, API keys)
 */
export function decryptApiKey(text: string): string {
  const algorithm = "aes-256-cbc";
  const key = Buffer.from(getEncryptionKey().padEnd(32, "0").slice(0, 32));
  const parts = text.split(":");
  const ivPart = parts.shift();
  if (!ivPart) throw new Error("Invalid encrypted text format");
  const iv = Buffer.from(ivPart, "hex");
  const encryptedText = parts.join(":");
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
