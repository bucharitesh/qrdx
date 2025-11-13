import { z } from "zod";

export const CORNER_EYE_PATTERNS = [
  "square",
  "rounded",
  "gear",
  "circle",
] as const;

// Zod schema
export const cornerEyePatternSchema = z.enum(CORNER_EYE_PATTERNS);

// Inferred type
export type CornerEyePattern = z.infer<typeof cornerEyePatternSchema>;
