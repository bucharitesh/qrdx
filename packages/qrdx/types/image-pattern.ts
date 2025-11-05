export type BodyPattern =
  | "circle"
  | "circle-large"
  | "square"
  | "diamond"
  | "circle-mixed"
  | "pacman"
  | "rounded"
  | "clean-square";

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
