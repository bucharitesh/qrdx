export const BODY_PATTERN = [
  "circle",
  "circle-large",
  "square",
  "diamond",
  "circle-mixed",
  "pacman",
  "rounded",
  "clean-square",
] as const;

export type BodyPattern = (typeof BODY_PATTERN)[number];
