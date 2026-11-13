// Which dot and eye shapes scan together, for the shape pickers and the
// preview's Random buttons. Pure: the engine's known-weak style pairs
// (qrdx scan-risk) against the style a change would make.
import { getStylePairRisk } from "qrdx";
import type { QRStyle } from "@/types/theme";

/** ENGINE's known-weak style pairs (qrdx scan-risk), as a short reason. */
export function pairRisk(
  style: Partial<QRStyle>,
  change: Partial<QRStyle>,
): string | null {
  const next = { ...style, ...change };
  const risk = getStylePairRisk({
    bodyPattern: next.bodyPattern,
    cornerEyePattern: next.cornerEyePattern,
    cornerEyeDotPattern: next.cornerEyeDotPattern,
  });
  return risk ? `${risk.message}. ${risk.fix}.` : null;
}

/**
 * Pairs that fail our decode tests (body × eye, centre × eye) can't be
 * picked together: the tile is disabled instead of hiding either shape.
 */
export function pairBlocked(
  style: Partial<QRStyle>,
  change: Partial<QRStyle>,
): boolean {
  const next = { ...style, ...change };
  const kind = getStylePairRisk({
    bodyPattern: next.bodyPattern,
    cornerEyePattern: next.cornerEyePattern,
    cornerEyeDotPattern: next.cornerEyeDotPattern,
  })?.kind;
  return kind === "body-eye" || kind === "dot-eye";
}
