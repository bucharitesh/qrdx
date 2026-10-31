import type { QRProps } from "../types";
import type { CornerEyeDotPattern } from "../types/corner-dot";
import type { CornerEyePattern } from "../types/corner-eye";
import type { BodyPattern } from "../types/image-pattern";

// Style pairs that decoders miss, measured with jsQR through a phone-camera
// model (contrast loss + ¼-module blur) at 4–9 px per module; see
// tests/support/known-issues.ts. The shapes themselves are unchanged so
// existing codes keep their look; scan-score warns about the pairs instead.

/** Eye dots that break the finder's 1:1:3:1:1 ratio inside these eyes. */
export const WEAK_DOT_EYES: Partial<
  Record<CornerEyeDotPattern, readonly CornerEyePattern[]>
> = {
  // Not a 3×3 block: the ratio fails along the diagonal (jsQR, ZXing)
  diamond: [
    "square",
    "rounded",
    "diya",
    "extra-rounded",
    "message",
    "pointy",
    "leaf",
    "leaf-reverse",
    "drop",
    "bevel",
    "squircle",
    "cushion",
    "shield",
    "petal",
  ],
  banner: ["square", "rounded", "diya", "leaf"],
  // Curly frames' wavy hole meets these sharp-cornered dots under blur
  square: ["curly"],
  diya: ["curly"],
  message: ["curly"],
};

/** Body patterns whose thin modules next to these eyes fail at 9 px/module. */
export const WEAK_BODY_EYES: Partial<
  Record<BodyPattern, readonly CornerEyePattern[]>
> = {
  diamond: ["square"],
  pacman: ["rounded"],
  "small-square": ["square", "rounded"],
};

/**
 * Shapes that are fragile on their own, whatever they are paired with:
 * circle and curly eyes read only in lenient decoders (scan-score's eye
 * check), and these centres fail jsQR in sharp renders (screens, PNGs).
 */
export const WEAK_EYES: readonly CornerEyePattern[] = ["circle", "curly"];
export const WEAK_DOTS: readonly CornerEyeDotPattern[] = [
  "diamond",
  "banner",
  "star",
];

export interface StylePairRisk {
  /** A weak pair ("dot-eye", "body-eye") or a weak shape on its own */
  kind: "dot-eye" | "body-eye" | "eye" | "dot";
  message: string;
  fix: string;
}

/**
 * The known-weak style pair in `props`, if any. QRCodeSVG's defaults apply
 * (circle body, gear eyes, circle dots).
 */
export function getStylePairRisk(
  props: Pick<
    QRProps,
    "bodyPattern" | "cornerEyePattern" | "cornerEyeDotPattern"
  >
): StylePairRisk | null {
  const body = props.bodyPattern ?? "circle";
  const eye = props.cornerEyePattern ?? "gear";
  const dot = props.cornerEyeDotPattern ?? "circle";
  if (WEAK_DOT_EYES[dot]?.includes(eye)) {
    return {
      kind: "dot-eye",
      message: `${dot} centres in ${eye} eyes are missed by strict decoders`,
      fix: "Pick a square, rounded or circle centre, or another eye shape",
    };
  }
  if (WEAK_BODY_EYES[body]?.includes(eye)) {
    return {
      kind: "body-eye",
      message: `${body} dots next to ${eye} eyes are missed up close`,
      fix: "Pick a fuller dot shape or another eye shape",
    };
  }
  if (WEAK_DOTS.includes(dot)) {
    return {
      kind: "dot",
      message: `${dot} centres are missed in sharp renders and up close`,
      fix: "Pick a square, rounded or circle centre",
    };
  }
  if (WEAK_EYES.includes(eye)) {
    return {
      kind: "eye",
      message: `${eye} eyes only read in lenient decoders`,
      fix: "Pick square, rounded or gear eyes",
    };
  }
  return null;
}
