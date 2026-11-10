import "server-only";

import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

// Signed links to the bot's JPEGs (app/api/integrations/telegram/photo), so
// the route draws only codes the bot itself linked to. Each link carries
// `exp` (seconds since the epoch) and `sig`: an HMAC-SHA256 of `size`, `exp`
// and `data`, as base64url. The key is derived from TELEGRAM_WEBHOOK_SECRET
// with HKDF and an info string of its own, so it's never the secret itself
// and no other value QRdx signs can pass for one of these.
//
// `exp` is rounded up to the next whole hour, plus an hour. The same code
// then gets the same link for a whole hour, which keeps the CDN serving it,
// and every link works for one to two hours. Telegram keeps its own copy of
// a photo once it's sent, so a code in a chat keeps showing after that.

const INFO = "qrdx:telegram:photo:v1";
const HOUR_MS = 3_600_000;
const HOUR_SECONDS = 3600;

/** The longest a link stays valid: one made just after an hour starts. */
export const PHOTO_LINK_MAX_SECONDS = 2 * HOUR_SECONDS;

/** The signing key for `secret` (TELEGRAM_WEBHOOK_SECRET). */
export function photoLinkKey(secret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, "", INFO, 32));
}

/** `exp` for a link made at `now`: the next whole hour plus one, in seconds. */
export function photoLinkExpiry(now: number = Date.now()): number {
  return Math.ceil(now / HOUR_MS) * HOUR_SECONDS + HOUR_SECONDS;
}

/**
 * The signature of one link. `size` and `exp` are digits only, so they can't
 * hold the line breaks that separate them from `data`.
 */
export function photoLinkSignature(
  data: string,
  size: number | string,
  exp: number | string,
  secret: string,
): string {
  return createHmac("sha256", photoLinkKey(secret))
    .update(`${size}\n${exp}\n${data}`, "utf8")
    .digest("base64url");
}

/** The `exp` and `sig` query values for `data` at `size`, made at `now`. */
export function signPhotoLink(
  data: string,
  size: number,
  secret: string,
  now: number = Date.now(),
): { exp: string; sig: string } {
  const exp = String(photoLinkExpiry(now));
  return { exp, sig: photoLinkSignature(data, size, exp, secret) };
}

/** Whole numbers as the signer writes them: no sign, no leading zero. */
const WHOLE = /^[1-9][0-9]{0,11}$/;
/** 32 bytes of base64url, unpadded. */
const SIGNATURE = /^[A-Za-z0-9_-]{43}$/;

export interface VerifiedPhotoLink {
  data: string;
  size: number;
  /** The signature as the signer writes it: one per link, for rate limits. */
  sig: string;
}

/**
 * The content and size of a link the bot signed that hasn't expired, or null
 * when anything is missing, changed, expired or valid for longer than the
 * signer ever makes links. The signature is compared in constant time, as
 * text, so another spelling of the same bytes doesn't pass.
 */
export function verifyPhotoLink(
  params: URLSearchParams,
  secret: string,
  now: number = Date.now(),
): VerifiedPhotoLink | null {
  const data = params.get("data");
  const size = params.get("size");
  const exp = params.get("exp");
  const sig = params.get("sig");
  if (!(secret && data !== null && size && exp && sig)) return null;
  if (!(WHOLE.test(size) && WHOLE.test(exp) && SIGNATURE.test(sig))) {
    return null;
  }
  const secondsLeft = Number(exp) - now / 1000;
  if (!(secondsLeft > 0 && secondsLeft <= PHOTO_LINK_MAX_SECONDS)) return null;

  const expected = Buffer.from(photoLinkSignature(data, size, exp, secret));
  const received = Buffer.from(sig);
  if (
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  ) {
    return null;
  }
  return { data, size: Number(size), sig };
}
