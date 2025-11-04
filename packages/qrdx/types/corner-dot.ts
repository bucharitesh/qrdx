export type CornerEyeDotPattern =
  | "square"
  | "rounded-square"
  | "circle"
  | "rounded-inward"
  | "rounded-inward-flipped"
  | "semi-round"
  | "leaf"
  | "diamond"
  | "diamond-rounded";

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
