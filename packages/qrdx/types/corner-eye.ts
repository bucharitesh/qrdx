import { z } from "zod";

export const CORNER_EYE_PATTERNS = [
  "square",
  "rounded",
  "gear",
  "circle",
  "diya",
  "extra-rounded",
  "message",
  "pointy",
  "curly",
  // Added after 0.0.46
  "leaf",
  "drop",
  "octagon",
  "bevel",
  "squircle",
  "cushion",
  "shield",
  "petal",
  "leaf-reverse",
] as const;

// Zod schema
export const cornerEyePatternSchema = z.enum(CORNER_EYE_PATTERNS);

// Inferred type
export type CornerEyePattern = z.infer<typeof cornerEyePatternSchema>;
