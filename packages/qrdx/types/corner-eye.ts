export type CornerEyePattern =
  | "square"
  | "rounded"
  | "rounded-inward"
  | "rounded-inward-flipped"
  | "gear"
  | "semi-round"
  | "rounded-extra"
  | "rounded-square"
  | "circle";

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
