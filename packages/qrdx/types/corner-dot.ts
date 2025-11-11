import { z } from "zod";

export const CORNER_EYE_DOT_PATTERNS = [
  "square",
  "rounded-square",
  "circle",
  "diamond",
] as const;

// Zod schema
export const cornerEyeDotPatternSchema = z.enum(CORNER_EYE_DOT_PATTERNS);

// Inferred type
export type CornerEyeDotPattern = z.infer<typeof cornerEyeDotPatternSchema>;
