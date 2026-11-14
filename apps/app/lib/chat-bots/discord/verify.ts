import { createPublicKey, type KeyObject, verify } from "node:crypto";

// Discord signs every interaction it sends with the app's Ed25519 key:
// X-Signature-Ed25519 is the signature (hex) over X-Signature-Timestamp
// followed by the raw request body, and the developer portal shows the
// public key as hex. An endpoint must answer 401 to a bad signature; Discord
// sends some on purpose when the Interactions Endpoint URL is saved and
// refuses an endpoint that accepts them.

/** Requests signed longer ago (or further ahead) than this are refused. */
const MAX_SIGNATURE_AGE_SECONDS = 5 * 60;

const HEX_KEY = /^[0-9a-f]{64}$/i;
const HEX_SIGNATURE = /^[0-9a-f]{128}$/i;
const UNIX_SECONDS = /^\d{1,12}$/;

/**
 * The app's public key from its 64-character hex form (the raw 32 bytes), or
 * null when that isn't what it is.
 */
export function discordPublicKey(hex: string): KeyObject | null {
  const value = hex.trim();
  if (!HEX_KEY.test(value)) return null;
  try {
    return createPublicKey({
      key: {
        kty: "OKP",
        crv: "Ed25519",
        x: Buffer.from(value, "hex").toString("base64url"),
      },
      format: "jwk",
    });
  } catch {
    return null;
  }
}

export interface SignedRequest {
  /** X-Signature-Ed25519 */
  signature: string | null;
  /** X-Signature-Timestamp, in Unix seconds */
  timestamp: string | null;
  /** The body exactly as it arrived, before any parsing. */
  body: Uint8Array;
}

/**
 * True when Discord signed this request with the app's key, recently.
 * Checked before the body is parsed or acted on.
 */
export function isSignedByDiscord(
  publicKey: KeyObject,
  { signature, timestamp, body }: SignedRequest,
  now = Date.now(),
): boolean {
  if (!(signature && timestamp)) return false;
  if (!(HEX_SIGNATURE.test(signature) && UNIX_SECONDS.test(timestamp))) {
    return false;
  }
  const age = Math.abs(now / 1000 - Number(timestamp));
  if (age > MAX_SIGNATURE_AGE_SECONDS) return false;
  try {
    return verify(
      null,
      Buffer.concat([Buffer.from(timestamp, "utf8"), body]),
      publicKey,
      Buffer.from(signature, "hex"),
    );
  } catch {
    return false;
  }
}
