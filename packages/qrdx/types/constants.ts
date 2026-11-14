// Option lists and limits, without zod: the engine draws with these, so an
// app that only renders codes never loads zod. The zod schemas built from
// them (and their inferred types) live in the domain modules next to this
// one (art.ts, corner-dot.ts, frame.ts, qr.ts…), which re-export them.

// ── Art (art.ts) ───────────────────────────────────────────────────────────

/**
 * Art modes blend a picture into the code itself (vector output, no AI):
 * - "logo" (Logo QR): the logo, traced into crisp vector shapes, either fills
 *   the code under a fine dot screen ("blend") or sits on a rounded plate in
 *   the middle of a code tinted with its colors ("badge").
 * - "halftone" (Image QR): the photo shows through every module around a
 *   small center dot that keeps the module's dark/light value, in full color
 *   ("color") or as an error-diffused black-and-white halftone ("mono").
 * Finder, alignment and format patterns always stay crisp.
 */
export const QR_ART_MODES = ["logo", "halftone"] as const;

/** Looks within each mode; the first one is the mode's default. */
export const QR_ART_VARIANTS = {
  logo: ["blend", "badge"],
  halftone: ["color", "mono"],
} as const satisfies Record<(typeof QR_ART_MODES)[number], readonly string[]>;

/** Largest side of an art sample grid, in pixels. */
export const QR_ART_MAX_SAMPLE_SIZE = 192;

// ── Eyes (corner-dot.ts, corner-eye.ts) ────────────────────────────────────

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

// ── Body (image-pattern.ts) ────────────────────────────────────────────────

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

// ── Frames (frame.ts) ──────────────────────────────────────────────────────

export const FRAME_STYLES = [
  "none",
  "banner-bottom",
  "banner-top",
  "border",
  "rounded-border",
  "speech-bubble",
  // Added after 0.0.46
  "banner-top-bottom",
  "speech-bubble-top",
  "chat-bubble",
  "circle",
  "polaroid",
  "phone",
  "ticket",
  "badge",
  "envelope",
  "tag",
  "menu-card",
  "sticker",
  "gradient-border",
  "focus",
] as const;

/** Longest call-to-action label a frame renders. */
export const FRAME_TEXT_MAX_LENGTH = 24;

/** Label used when a frame has no `text`. Pass `""` to hide the label. */
export const DEFAULT_FRAME_TEXT = "Scan me";

/** Smallest and largest `fontScale` (label size relative to the default). */
export const FRAME_FONT_SCALE_MIN = 0.5;
export const FRAME_FONT_SCALE_MAX = 1.5;

// ── The code (qr.ts) ───────────────────────────────────────────────────────

/**
 * How a logo is cropped: "square" (as uploaded), "rounded" corners or a
 * "circle". A plate behind the logo takes the same shape.
 */
export const LOGO_SHAPES = ["square", "rounded", "circle"] as const;

/**
 * Smallest and largest logo width, as a share of the code's width. Above
 * 25% even level H stops reading in our decode tests (tests/engine-options).
 */
export const LOGO_SIZE_MIN = 0.1;
export const LOGO_SIZE_MAX = 0.3;
/** Logo width `getQRData` uses when no size is given (25%). */
export const LOGO_SIZE_DEFAULT = 0.25;
/** Most clear space around a logo, in modules. */
export const LOGO_PADDING_MAX = 2;

/** Smallest and largest `moduleScale` (size of each data module). */
export const MODULE_SCALE_MIN = 0.5;
export const MODULE_SCALE_MAX = 1;

/**
 * Share of the code a logo may cover before `autoLevel` raises error
 * correction to H (level L recovers about 7%).
 */
export const AUTO_LEVEL_LOGO_COVERAGE = 0.07;

/**
 * Outline of the whole code: "square" (the QR symbol as is), "circle" or
 * "heart": the symbol sits in a disc or a heart filled with decorative
 * modules. Decoders read only the symbol, which keeps its quiet ring
 * (`margin`, at least QR_CIRCLE_QUIET_MIN modules) before the decoration
 * starts. `shape` also takes a `QRSilhouette`, an outline of your own.
 */
export const QR_SHAPES = ["square", "circle", "heart"] as const;
/** Smallest light ring between a shaped code's symbol and its decoration. */
export const QR_CIRCLE_QUIET_MIN = 3;

/** Most cells along a silhouette's longer side. */
export const QR_SILHOUETTE_MAX_CELLS = 64;
/** Fewest cells along each side of a silhouette. */
export const QR_SILHOUETTE_MIN_CELLS = 8;
/**
 * Smallest share of the artwork's width the symbol and its quiet ring may
 * take inside a silhouette (a circle code's is about 0.7, a heart's 0.6).
 * Thinner silhouettes are refused: the code would be a small square in a
 * large field of decoration.
 */
export const QR_SILHOUETTE_MIN_SHARE = 0.42;

/** The three finder patterns, for per-eye colors. */
export const EYE_POSITIONS = ["topLeft", "topRight", "bottomLeft"] as const;
