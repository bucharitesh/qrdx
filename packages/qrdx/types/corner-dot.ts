export const CORNER_EYE_DOT_PATTERNS = [
  "square",
  "rounded-square",
  "circle",
  "rounded-inward",
  "rounded-inward-flipped",
  "semi-round",
  "leaf",
  "diamond",
  "diamond-rounded",
] as const;

export type CornerEyeDotPattern = (typeof CORNER_EYE_DOT_PATTERNS)[number];
