export type BodyPattern =
  | "circle"
  | "square"
  | "diamond"
  | "circle-mixed"
  | "pacman"
  | "rounded"
  | "clean-square";

export const BODY_PATTERN = [
  "circle",
  "square",
  "diamond",
  "circle-mixed",
  "pacman",
  "rounded",
  "clean-square",
] as const;
