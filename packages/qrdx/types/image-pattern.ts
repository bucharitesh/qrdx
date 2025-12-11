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
] as const;

// Zod schema
export const bodyPatternSchema = z.enum(BODY_PATTERN);

// Inferred type
export type BodyPattern = z.infer<typeof bodyPatternSchema>;
