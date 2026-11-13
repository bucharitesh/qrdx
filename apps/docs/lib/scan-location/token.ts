import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/env";

// The short-lived link between a scan (its qr_scan row, created by /q/<slug>)
// and the location the scanner may share a moment later: the location step
// (redirect codes) and hosted pages post it back with the coordinates. Signed
// with its own key, so it can't be guessed, altered or swapped for another
// signed value (the conversion token in lib/redirect/routing.ts uses another).

/** How long after the scan its location can still be attached. */
export const LOCATION_TOKEN_TTL_SECONDS = 15 * 60;

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const SIGNATURE_LENGTH = 22;
const SIGNATURE = new RegExp(`^[A-Za-z0-9_-]{${SIGNATURE_LENGTH}}$`);
const MAX_TOKEN_LENGTH = 200;

let key: Buffer | null = null;

function tokenKey(): Buffer {
  if (!key) {
    key = createHash("sha256")
      .update(
        `qrdx:scan-location:${env.SCAN_HASH_SALT ?? env.BETTER_AUTH_SECRET}`,
      )
      .digest();
  }
  return key;
}

const signature = (payload: string) =>
  createHmac("sha256", tokenKey())
    .update(payload)
    .digest("base64url")
    .slice(0, SIGNATURE_LENGTH);

/** `<scanId>.<codeId>.<issued, base-36 seconds>.<signature>` */
export function signLocationToken(
  scanId: string,
  codeId: string,
  issuedAt: Date,
): string {
  const payload = `${scanId}.${codeId}.${Math.floor(issuedAt.getTime() / 1000).toString(36)}`;
  return `${payload}.${signature(payload)}`;
}

export interface LocationToken {
  scanId: string;
  codeId: string;
  issuedAt: Date;
}

/** The token's scan, or null when forged, malformed, expired or from the future. */
export function verifyLocationToken(
  token: unknown,
  now: Date = new Date(),
): LocationToken | null {
  if (typeof token !== "string" || token.length > MAX_TOKEN_LENGTH) {
    return null;
  }
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [scanId = "", codeId = "", issued = "", sig = ""] = parts;
  if (
    !(ID.test(scanId) && ID.test(codeId)) ||
    !/^[0-9a-z]{1,10}$/.test(issued) ||
    !SIGNATURE.test(sig)
  ) {
    return null;
  }
  const expected = signature(`${scanId}.${codeId}.${issued}`);
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const issuedAt = new Date(Number.parseInt(issued, 36) * 1000);
  const age = now.getTime() - issuedAt.getTime();
  if (age > LOCATION_TOKEN_TTL_SECONDS * 1000 || age < -60_000) return null;
  return { scanId, codeId, issuedAt };
}
