export const CORNER_EYE_PATTERNS = [
  "square",
  "rounded",
  "rounded-inward",
  "rounded-inward-flipped",
  "gear",
  "semi-round",
  "rounded-extra",
  "rounded-square",
  "circle",
] as const;

export type CornerEyePattern = (typeof CORNER_EYE_PATTERNS)[number];
