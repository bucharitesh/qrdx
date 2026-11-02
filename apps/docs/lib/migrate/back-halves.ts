// Keeping a link's original back-half (bit.ly/<back-half>,
// go.brand.com/<back-half>) as its QRdx slug: on the workspace's custom domain
// for links on that domain (unique per domain), or on the shared qrdx.dev/q/
// (unique across QRdx). Pure and client-safe.

import {
  isGeneratedSlug,
  type SlugProblem,
  slugProblem,
} from "@/lib/short-links";
import type { BackHalfStatus, BackHalfTarget } from "./types";

type ConflictStatus = Exclude<BackHalfStatus, "kept" | "not-on-domain">;

/** Why a back-half wasn't kept, for the preview ("spring-menu → Ab3xK9q"). */
export function backHalfMessage(
  status: ConflictStatus,
  target: BackHalfTarget,
  domain: string | null,
): string {
  const where =
    target === "domain" && domain ? domain : "the shared qrdx.dev links";
  switch (status) {
    case "shape":
      return "QRdx back-halves are 3 to 64 letters, digits, - or _, so this one can't be kept.";
    case "reserved":
      return target === "domain"
        ? `This back-half is reserved on ${where}.`
        : domain
          ? `This back-half is reserved on qrdx.dev. Add ${domain} on the Domains page to keep it there.`
          : "This back-half is reserved on qrdx.dev.";
    case "taken":
      return target === "domain"
        ? `Another code on ${where} already uses this back-half.`
        : "Another QRdx code already uses this back-half on qrdx.dev.";
    case "repeated":
      return "Another selected link has the same back-half.";
  }
}

/** Why a back-half can't be a slug in `target`, before checking availability. */
export function backHalfShapeProblem(
  backHalf: string,
  target: BackHalfTarget,
): "shape" | "reserved" | null {
  const problem: SlugProblem | null = slugProblem(backHalf, {
    onCustomDomain: target === "domain",
  });
  if (!problem) return null;
  return problem === "reserved" ? "reserved" : "shape";
}

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** Deterministic base62 string from a seed (FNV-1a). */
function hashSlug(seed: string, length: number): string {
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
 * Generated slugs to use when a back-half can't be kept. Derived from the
 * link, so the preview and the import that follows show the same one; a
 * random one comes last. The caller drops the taken ones.
 */
export function fallbackCandidates(
  seed: string,
  random: () => string,
): string[] {
  const candidates = [hashSlug(seed, 7), hashSlug(`${seed}+`, 7), random()];
  return [...new Set(candidates)].filter(isGeneratedSlug);
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
