import {
  SHOWCASE_ACCENT as ACCENT,
  SHOWCASE_INK,
  SHOWCASE_PAPER,
} from "@/lib/landing/showcase-styles";
import type { QRStyle } from "@/types/theme";

// The hero editor's style family: near-black ink on white paper, rounded
// modules, with the brand blue used only as an accent on the eyes. The
// feature demos below the hero each use a showcase style instead
// (lib/landing/showcase-styles.ts, ./codes.ts).

export const INK = SHOWCASE_INK;

export const FAMILY = {
  bgColor: SHOWCASE_PAPER,
  fgColor: INK,
  eyeColor: INK,
  dotColor: ACCENT,
  bodyPattern: "rounded",
  cornerEyePattern: "rounded",
  cornerEyeDotPattern: "rounded",
} satisfies QRStyle;

/** Same family with a gentle ink-to-blue gradient. */
export const FAMILY_GRADIENT = {
  ...FAMILY,
  fgColor: {
    type: "linear",
    angle: 135,
    stops: [
      { color: INK, offset: 0 },
      { color: "#1d3fae", offset: 100 },
    ],
  },
  eyeColor: INK,
  dotColor: ACCENT,
} satisfies QRStyle;
