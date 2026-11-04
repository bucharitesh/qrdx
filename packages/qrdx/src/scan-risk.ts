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

// Sharp renders (screens, PNG exports, high-resolution prints), with no
// camera blur: a circle centre inside these eyes fails jsQR at some sizes,
// while zbar reads every one. The circle is a little short along the
// diagonal, so the finder's 1:1:3:1:1 cross-check fails inside rings with
// square corners; round rings (gear, circle, octagon) are unaffected.
// Measured on 3 values × 4–28 px per module (tests/decode-sharp-centre.test.ts).
// One decoder only, so these warn in the scan score; picking them is not
// blocked and no default changes until a phone check confirms it.

/** Eyes whose circle centre fails strict decoders in sharp renders. */
export const WEAK_SHARP_DOT_EYES: Partial<
  Record<CornerEyeDotPattern, readonly CornerEyePattern[]>
> = {
  circle: [
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
};

// Solid bodies leave jsQR enough margin to read anyway
const SOLID_BODIES = ["square", "liquid", "classy", "classy-rounded"] as const;

/**
 * Bodies that read every sharp render of a weak pair above, keyed
 * "centre/eye". Pairs not listed fail with every body.
 */
export const SHARP_DOT_EYE_SAFE_BODIES: Partial<
  Record<`${CornerEyeDotPattern}/${CornerEyePattern}`, readonly BodyPattern[]>
> = {
  "circle/rounded": SOLID_BODIES,
  "circle/extra-rounded": SOLID_BODIES,
  "circle/message": [...SOLID_BODIES, "leaf"],
  "circle/pointy": SOLID_BODIES,
  "circle/leaf-reverse": SOLID_BODIES,
  "circle/drop": SOLID_BODIES,
  "circle/bevel": [...SOLID_BODIES, "leaf"],
  "circle/squircle": [
    ...SOLID_BODIES,
    "circle",
    "diamond",
    "circle-mixed",
    "rounded",
    "horizontal-line",
    "leaf",
    "heart",
    "mosaic",
    "octagon",
  ],
  "circle/cushion": SOLID_BODIES,
  "circle/shield": [...SOLID_BODIES, "rounded", "horizontal-line", "leaf"],
  "circle/petal": SOLID_BODIES,
};

/** True when this centre, eye and body fail strict decoders in sharp renders. */
export function isWeakSharpPair(
  dot: CornerEyeDotPattern,
  eye: CornerEyePattern,
  body: BodyPattern
): boolean {
  return (
    (WEAK_SHARP_DOT_EYES[dot]?.includes(eye) ?? false) &&
    !SHARP_DOT_EYE_SAFE_BODIES[`${dot}/${eye}`]?.includes(body)
  );
}

export interface StylePairRisk {
  /**
   * A weak pair ("dot-eye", "body-eye"), a weak shape on its own, or a
   * centre and eye that fail strict decoders in sharp renders only
   * ("sharp-dot-eye": a warning; the editor doesn't block it).
   */
  kind: "dot-eye" | "body-eye" | "eye" | "dot" | "sharp-dot-eye";
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
  if (isWeakSharpPair(dot, eye, body)) {
    return {
      kind: "sharp-dot-eye",
      message: `${dot} centres in ${eye} eyes are missed by some decoders on screens and in sharp prints`,
      fix: "Pick a rounded centre, or gear or octagon eyes",
    };
  }
  return null;
}
