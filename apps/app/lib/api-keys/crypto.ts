import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  API_KEY_PREFIX,
  API_KEY_RANDOM_LENGTH,
  API_KEY_START_LENGTH,
} from "./shared";

// Making and checking API keys. A key is shown to its creator once; the
// database keeps only its SHA-256 hash (the key carries 238 random bits, so
// a fast hash is enough: there is nothing to brute-force) and its first
// characters for display.

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
// The largest multiple of 62 below 256: bytes at or above it are skipped, so
// every character is equally likely (no modulo bias).
const UNBIASED_LIMIT = 248;

/** `length` uniformly random base62 characters from a CSPRNG. */
export function randomBase62(
  length: number,
  random: (size: number) => Uint8Array = randomBytes,
): string {
  let out = "";
  while (out.length < length) {
    for (const byte of random(length * 2)) {
      if (byte >= UNBIASED_LIMIT) continue;
      out += BASE62[byte % 62];
      if (out.length === length) break;
    }
  }
  return out;
}

/** SHA-256 of the whole key, hex: the only form the database stores. */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Constant-time comparison of two hex hashes. */
export function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return (
    left.length === right.length &&
    left.length > 0 &&
    timingSafeEqual(left, right)
  );
}

export interface GeneratedApiKey {
  /** The key itself: give it to the creator once, never store it. */
  key: string;
  hash: string;
  /** `qrdx_` and the next 6 characters, for lists */
  start: string;
}

export function generateApiKey(): GeneratedApiKey {
  const key = `${API_KEY_PREFIX}${randomBase62(API_KEY_RANDOM_LENGTH)}`;
  return {
    key,
    hash: hashApiKey(key),
    start: key.slice(0, API_KEY_START_LENGTH),
  };
}
