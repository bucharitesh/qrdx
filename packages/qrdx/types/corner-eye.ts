import { z } from "zod";
import { CORNER_EYE_PATTERNS, RETIRED_CORNER_EYE_PATTERNS } from "./constants";

export { CORNER_EYE_PATTERNS, RETIRED_CORNER_EYE_PATTERNS } from "./constants";

/** Accepts current and retired values, so saved designs still validate. */
export const cornerEyePatternSchema = z.enum([
  ...CORNER_EYE_PATTERNS,
  ...RETIRED_CORNER_EYE_PATTERNS,
]);

/** Current values only: for anything that offers a choice (UI, AI, MCP). */
export const pickableCornerEyePatternSchema = z.enum(CORNER_EYE_PATTERNS);

// Inferred types
export type CornerEyePattern = z.infer<typeof cornerEyePatternSchema>;
export type PickableCornerEyePattern = (typeof CORNER_EYE_PATTERNS)[number];
