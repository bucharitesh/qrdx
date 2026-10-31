// Keeping a link's original back-half (go.brand.com/<back-half>) as its QRdx
// slug. QRdx short links are exactly 7 letters or digits and slugs are unique
// across all of QRdx, so not every back-half can move. Pure and client-safe.

import {
  generateSlug,
  isReservedSlug,
  isValidSlug,
  SLUG_LENGTH,
} from "@/lib/short-links";
import type { BackHalfStatus } from "./types";

export const BACK_HALF_MESSAGES: Record<
  Exclude<BackHalfStatus, "kept" | "not-on-domain">,
  string
> = {
  shape: `QRdx short links are exactly ${SLUG_LENGTH} letters or digits, so this back-half can't be kept.`,
  reserved: "This back-half is reserved for QRdx pages.",
  taken: "Another QRdx code already uses this back-half.",
  repeated: "Another selected link has the same back-half.",
};

/** Why a back-half can't be a QRdx slug, before checking availability. */
export function backHalfShapeProblem(
  backHalf: string,
): "shape" | "reserved" | null {
  if (isValidSlug(backHalf)) return null;
  return /^[0-9A-Za-z]+$/.test(backHalf) &&
    backHalf.length === SLUG_LENGTH &&
    isReservedSlug(backHalf)
    ? "reserved"
    : "shape";
}

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** Deterministic base62 filler from a string (FNV-1a), for padding. */
function filler(seed: string, length: number): string {
  let hash = 0x811c9dc5;
  let out = "";
  for (let round = 0; out.length < length; round++) {
    for (const char of `${seed}:${round}`) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    out += BASE62[hash % 62];
  }
  return out;
}

/**
 * Alternatives close to the original: its letters and digits cut or padded to
 * 7, then two random slugs. The caller drops the taken ones.
 */
export function backHalfCandidates(
  backHalf: string,
  random: () => string = generateSlug,
): string[] {
  const alnum = backHalf.replace(/[^0-9A-Za-z]/g, "");
  const candidates: string[] = [];
  if (alnum.length >= SLUG_LENGTH) {
    candidates.push(alnum.slice(0, SLUG_LENGTH), alnum.slice(-SLUG_LENGTH));
  } else if (alnum.length > 0) {
    candidates.push(
      alnum + filler(backHalf, SLUG_LENGTH - alnum.length),
      alnum + filler(`${backHalf}+`, SLUG_LENGTH - alnum.length),
    );
  }
  candidates.push(random(), random());
  return [...new Set(candidates)].filter(isValidSlug);
}

/** First candidate nobody uses (taken = in QRdx, used = earlier in the batch). */
export function pickSuggestion(
  candidates: string[],
  taken: ReadonlySet<string>,
  used: ReadonlySet<string>,
): string | null {
  return (
    candidates.find(
      (candidate) => !(taken.has(candidate) || used.has(candidate)),
    ) ?? null
  );
}
