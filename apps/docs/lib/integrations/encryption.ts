import crypto from "crypto";
import { env } from "@/lib/env";

/**
 * Encrypt sensitive data (tokens, API keys)
 */
export function encryptApiKey(text: string): string {
  const algorithm = "aes-256-cbc";
  const key = Buffer.from(
    env.INTEGRATION_ENCRYPTION_KEY.padEnd(32, "0").slice(0, 32),
  );
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

/**
 * Decrypt sensitive data (tokens, API keys)
 */
export function decryptApiKey(text: string): string {
  const algorithm = "aes-256-cbc";
  const key = Buffer.from(
    env.INTEGRATION_ENCRYPTION_KEY.padEnd(32, "0").slice(0, 32),
  );
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

