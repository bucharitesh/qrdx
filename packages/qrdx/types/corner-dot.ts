import { z } from "zod";
import {
  CORNER_EYE_DOT_PATTERNS,
  RETIRED_CORNER_EYE_DOT_PATTERNS,
} from "./constants";

export {
  CORNER_EYE_DOT_PATTERNS,
  RETIRED_CORNER_EYE_DOT_PATTERNS,
} from "./constants";

/** Accepts current and retired values, so saved designs still validate. */
export const cornerEyeDotPatternSchema = z.enum([
  ...CORNER_EYE_DOT_PATTERNS,
  ...RETIRED_CORNER_EYE_DOT_PATTERNS,
]);

/** Current values only: for anything that offers a choice (UI, AI, MCP). */
export const pickableCornerEyeDotPatternSchema = z.enum(
  CORNER_EYE_DOT_PATTERNS
);

// Inferred types
export type CornerEyeDotPattern = z.infer<typeof cornerEyeDotPatternSchema>;
export type PickableCornerEyeDotPattern =
  (typeof CORNER_EYE_DOT_PATTERNS)[number];
