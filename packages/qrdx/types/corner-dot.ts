import { z } from "zod";

/**
 * Eye centres to offer: every one decodes with jsQR and ZXing through a
 * phone-camera model and in sharp renders (tests/catalog-*.test.ts).
 */
export const CORNER_EYE_DOT_PATTERNS = [
  "square",
  "rounded",
  "circle",
  "message",
  "message-reverse",
  "diya",
  "diya-reverse",
  "rounded-triangle",
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

/**
 * @deprecated Retired eye centres: they don't decode reliably (`diamond`
 * and `star` fail ZXing at phone distances, `banner` fails jsQR in every
 * sharp render). The renderer still draws them so saved designs keep
 * working, but nothing offers them any more.
 */
export const RETIRED_CORNER_EYE_DOT_PATTERNS = [
  "diamond",
  "star",
  "banner",
] as const;

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
