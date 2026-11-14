import "server-only";

import { randomBytes } from "node:crypto";
import { hashSecret } from "@/lib/oauth";

// Prefixed so they are recognisable in logs and by secret scanners. Client IDs
// are public; client secrets are shown once and only their bcrypt hash is
// stored (the token endpoint checks them with verifySecret in lib/oauth.ts).

export const CLIENT_ID_PREFIX = "qrdx_app_";
export const CLIENT_SECRET_PREFIX = "qrdx_secret_";

// bcrypt reads at most 72 bytes; a longer secret would be silently truncated.
const BCRYPT_MAX_BYTES = 72;

export function generateClientId(): string {
  return `${CLIENT_ID_PREFIX}${randomBytes(12).toString("hex")}`;
}

/** 256 random bits, base64url: 55 ASCII characters with the prefix. */
export function generateClientSecret(): string {
  const secret = `${CLIENT_SECRET_PREFIX}${randomBytes(32).toString("base64url")}`;
  if (Buffer.byteLength(secret) > BCRYPT_MAX_BYTES) {
    throw new Error("Client secret exceeds bcrypt's input limit");
  }
  return secret;
}

/** A new secret (to show once) and the hash to store in its place. */
export async function createClientSecret(): Promise<{
  secret: string;
  hash: string;
}> {
  const secret = generateClientSecret();
  return { secret, hash: await hashSecret(secret) };
}
