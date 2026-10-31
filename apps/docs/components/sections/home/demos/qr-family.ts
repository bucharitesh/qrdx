import type { QRStyle } from "@/types/theme";

// One QR style family for every code drawn on the home page: near-black ink on
// white paper, rounded modules, with the brand blue used only as an accent on
// the eyes. Demos vary one thing at a time from this base.

export const INK = "#0b0b0d";
export const ACCENT = "#155dfc";
export const PAPER = "#ffffff";

export const FAMILY = {
  bgColor: PAPER,
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
