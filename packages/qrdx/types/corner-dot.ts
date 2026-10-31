import { z } from "zod";

export const CORNER_EYE_DOT_PATTERNS = [
  "square",
  "rounded",
  "circle",
  "diamond",
  "message",
  "message-reverse",
  "diya",
  "diya-reverse",
  "rounded-triangle",
  "star",
  "banner",
  // Added after 0.0.46
  "leaf",
  "drop",
  "plus",
  "cross-rounded",
  "hexagon",
  "octagon",
  "flower",
  "heart",
  "squircle",
  "dots",
  "extra-rounded",
  "leaf-reverse",
  "drop-reverse",
] as const;

// Zod schema
export const cornerEyeDotPatternSchema = z.enum(CORNER_EYE_DOT_PATTERNS);

// Inferred type
export type CornerEyeDotPattern = z.infer<typeof cornerEyeDotPatternSchema>;
