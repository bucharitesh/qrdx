import { z } from "zod";

export const BODY_PATTERN = [
  "circle",
  "circle-large",
  "square",
  "diamond",
  "circle-mixed",
  "pacman",
  "rounded",
  "small-square",
  "vertical-line",
  // Added after 0.0.46 (drawn by src/body-patterns.tsx)
  "horizontal-line",
  "liquid",
  "liquid-horizontal",
  "liquid-vertical",
  "classy",
  "classy-rounded",
  "leaf",
  "plus",
  "hexagon",
  "star",
  "heart",
  "random-dots",
  "mosaic",
  "octagon",
] as const;

// Zod schema
export const bodyPatternSchema = z.enum(BODY_PATTERN);

// Inferred type
export type BodyPattern = z.infer<typeof bodyPatternSchema>;
