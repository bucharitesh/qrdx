import { z } from "zod";

/**
 * Eye frames to offer: every one decodes with jsQR and ZXing through a
 * phone-camera model and in sharp renders (tests/catalog-*.test.ts).
 */
export const CORNER_EYE_PATTERNS = [
  "square",
  "rounded",
  "gear",
  "circle",
  "diya",
  "extra-rounded",
  "message",
  "pointy",
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

/**
 * @deprecated Retired eye frames: `curly` fails ZXing (most Android
 * scanners) at 4–6 px per module and in sharp renders. The renderer still
 * draws it so saved designs keep working, but nothing offers it any more.
 */
export const RETIRED_CORNER_EYE_PATTERNS = ["curly"] as const;

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
