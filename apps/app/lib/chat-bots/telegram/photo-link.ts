import "server-only";

import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

// Signed links to the bot's JPEGs (app/api/integrations/telegram/photo), so
// the route draws only codes the bot itself linked to, in the design the bot
// scan-checked. Each link carries `exp` (seconds since the epoch) and `sig`:
// an HMAC-SHA256 of `size`, `exp`, the design (`style` and `logoIcon`, empty
// for the plain code) and `data`, as base64url. The key is derived from
// TELEGRAM_WEBHOOK_SECRET with HKDF and an info string of its own, so it's
// never the secret itself and no other value QRdx signs can pass for one of
// these.
//
// `exp` is rounded up to the next whole hour, plus an hour. The same code
// then gets the same link for a whole hour, which keeps the CDN serving it,
// and every link works for one to two hours. Telegram keeps its own copy of
// a photo once it's sent, so a code in a chat keeps showing after that.

// v2: the design is signed too.
const INFO = "qrdx:telegram:photo:v2";
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

/** A code's design as the link carries it; empty strings for the plain code. */
export interface PhotoDesign {
  /** The editor's playground style value ("1.…") */
  style: string;
  /** A quick logo icon id */
  logoIcon: string;
}

const PLAIN: PhotoDesign = { style: "", logoIcon: "" };

/** A playground style value (lib/playground-links.ts), or nothing. */
const STYLE = /^(?:1\.[A-Za-z0-9_-]{1,4096})?$/;
/** A quick logo icon id, or nothing. */
const LOGO_ICON = /^(?:[a-z]{1,20})?$/;

/**
 * The signature of one link. `size` and `exp` are digits only, and the
 * design's two values can't hold a line break either (STYLE, LOGO_ICON), so
 * nothing can move between them and `data`, which comes last.
 */
export function photoLinkSignature(
  data: string,
  size: number | string,
  exp: number | string,
  secret: string,
  design: PhotoDesign = PLAIN,
): string {
  return createHmac("sha256", photoLinkKey(secret))
    .update(
      `${size}\n${exp}\n${design.style}\n${design.logoIcon}\n${data}`,
      "utf8",
    )
    .digest("base64url");
}

/**
 * The `exp` and `sig` query values for `data` at `size` in `design`, made at
 * `now`.
 */
export function signPhotoLink(
  data: string,
  size: number,
  secret: string,
  now: number = Date.now(),
  design: PhotoDesign = PLAIN,
): { exp: string; sig: string } {
  if (!(STYLE.test(design.style) && LOGO_ICON.test(design.logoIcon))) {
    throw new Error("The design can't go in a photo link");
  }
  const exp = String(photoLinkExpiry(now));
  return { exp, sig: photoLinkSignature(data, size, exp, secret, design) };
}

/** Whole numbers as the signer writes them: no sign, no leading zero. */
const WHOLE = /^[1-9][0-9]{0,11}$/;
/** 32 bytes of base64url, unpadded. */
const SIGNATURE = /^[A-Za-z0-9_-]{43}$/;

export interface VerifiedPhotoLink extends PhotoDesign {
  data: string;
  size: number;
  /** The signature as the signer writes it: one per link, for rate limits. */
  sig: string;
}

/**
 * The content, size and design of a link the bot signed that hasn't
 * expired, or null when anything is missing, changed, expired or valid for
 * longer than the signer ever makes links. The signature is compared in
 * constant time, as text, so another spelling of the same bytes doesn't
 * pass.
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
  const design: PhotoDesign = {
    style: params.get("style") ?? "",
    logoIcon: params.get("logoIcon") ?? "",
  };
  if (!(secret && data !== null && size && exp && sig)) return null;
  if (!(WHOLE.test(size) && WHOLE.test(exp) && SIGNATURE.test(sig))) {
    return null;
  }
  if (!(STYLE.test(design.style) && LOGO_ICON.test(design.logoIcon))) {
    return null;
  }
  const secondsLeft = Number(exp) - now / 1000;
  if (!(secondsLeft > 0 && secondsLeft <= PHOTO_LINK_MAX_SECONDS)) return null;

  const expected = Buffer.from(
    photoLinkSignature(data, size, exp, secret, design),
  );
  const received = Buffer.from(sig);
  if (
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  ) {
    return null;
  }
  return { data, size: Number(size), sig, ...design };
}
