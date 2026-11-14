// The preview toolbars' Random buttons: each press gives one part of the
// code a new look, never the one it has and never one that won't scan.
// Eyes and dots change shape only (their colors stay), the logo becomes
// another quick icon, the background another color the contrast check
// passes, the frame another built-in style that keeps its text. Pure, and
// `random` is passed in (Math.random in the app, a seeded one in tests).
import { CANONICAL_ORIGIN } from "@repo/config";
import {
  type AnyQRFrame,
  BUILT_IN_FRAMES,
  type BuiltInFrameStyle,
  type ColorConfig,
  getContrastRatio,
  getScanContrast,
  normalizeColorConfig,
  SCAN_CONTRAST_MIN,
} from "qrdx";
import { BODY_PATTERN, type BodyPattern, EYE_POSITIONS } from "qrdx/types";
import { defaultThemeState } from "@/config/qr";
import { LOGO_ICON_IDS } from "@/lib/qr-design/style";
import type { QRStyle } from "@/types/theme";
import { carryFrameSettings } from "../control-sections/frame-specs";
import { pairBlocked, pairRisk } from "../control-sections/pair-rules";
import { EYE_PRESETS } from "../control-sections/shape-catalog";

/** A number in [0, 1), like Math.random. */
export type Random = () => number;

/** One of `items`, or null when there are none. */
export function pickOne<T>(items: readonly T[], random: Random): T | null {
  if (items.length === 0) return null;
  const index = Math.min(items.length - 1, Math.floor(random() * items.length));
  return items[Math.max(0, index)] ?? null;
}

/** Candidates that scan safely, else those that at least aren't blocked. */
function safest<T>(
  items: T[],
  blocked: (item: T) => boolean,
  risky: (item: T) => boolean,
): T[] {
  const allowed = items.filter((item) => !blocked(item));
  const safe = allowed.filter((item) => !risky(item));
  return safe.length > 0 ? safe : allowed;
}

const withDefaults = (style: Partial<QRStyle>): QRStyle => ({
  ...defaultThemeState.styles,
  ...style,
});

// ── Eyes ───────────────────────────────────────────────────────────────────

export type EyeShapes = Pick<
  QRStyle,
  "cornerEyePattern" | "cornerEyeDotPattern"
>;

/**
 * Another outer + centre pair from the eye catalogue (EYE_PRESETS), one
 * the current dots scan with. Null when there's no other pair.
 */
export function randomEyes(
  style: Partial<QRStyle>,
  random: Random,
): EyeShapes | null {
  const current = withDefaults(style);
  const others = EYE_PRESETS.filter(
    (preset) =>
      preset.outer !== current.cornerEyePattern ||
      preset.centre !== current.cornerEyeDotPattern,
  );
  const change = (preset: (typeof EYE_PRESETS)[number]): EyeShapes => ({
    cornerEyePattern: preset.outer,
    cornerEyeDotPattern: preset.centre,
  });
  const chosen = pickOne(
    safest(
      others,
      (preset) => pairBlocked(current, change(preset)),
      (preset) => pairRisk(current, change(preset)) !== null,
    ),
    random,
  );
  return chosen ? change(chosen) : null;
}

// ── Dots ───────────────────────────────────────────────────────────────────

/** Another dot pattern the current eyes scan with, or null. */
export function randomDots(
  style: Partial<QRStyle>,
  random: Random,
): Pick<QRStyle, "bodyPattern"> | null {
  const current = withDefaults(style);
  const others = BODY_PATTERN.filter(
    (pattern) => pattern !== current.bodyPattern,
  );
  const chosen = pickOne<BodyPattern>(
    safest(
      others,
      (bodyPattern) => pairBlocked(current, { bodyPattern }),
      (bodyPattern) => pairRisk(current, { bodyPattern }) !== null,
    ),
    random,
  );
  return chosen ? { bodyPattern: chosen } : null;
}

// ── Logo ───────────────────────────────────────────────────────────────────

/** Another quick icon (logo-presets.tsx), or null. `current` is its id. */
export function randomLogoIcon(
  current: string | null,
  random: Random,
): string | null {
  return pickOne(
    LOGO_ICON_IDS.filter((id) => id !== current),
    random,
  );
}

// ── Background ─────────────────────────────────────────────────────────────

/**
 * Background colors Random picks from: soft tints that keep a dark code
 * readable, and a few deep ones for a light code on dark.
 */
export const BACKGROUND_SWATCHES = [
  "#ffffff",
  "#f8fafc",
  "#f4f4f5",
  "#fafaf9",
  "#f6f1e7",
  "#fff6ee",
  "#fdf3f7",
  "#f1f8fc",
  "#f3f7f0",
  "#fefce8",
  "#ecfdf5",
  "#eff6ff",
  "#f5f3ff",
  "#fff1f2",
  "#fff7ed",
  "#f0fdfa",
  "#fdf4ff",
  "#fffbeb",
  "#f7fee7",
  "#e0f2fe",
  "#fce7f3",
  "#ede9fe",
  "#dcfce7",
  "#fef3c7",
  "#0c0c0d",
  "#111827",
  "#1c1917",
  "#172554",
  "#14532d",
  "#3b0764",
] as const;

/** Every flat color a paint shows (each gradient stop; a picture's underlay). */
function colorsOf(color: ColorConfig | undefined): string[] {
  if (!color) return [];
  const paint = normalizeColorConfig(color);
  if (paint.type === "solid") return [paint.color];
  if (paint.type === "image") return paint.underlay ? [paint.underlay] : [];
  return paint.stops.map((stop) => stop.color);
}

/** The code's colors the background sits behind (the contrast checker's pairs). */
function codeColors(style: QRStyle): string[] {
  const eye = style.eyeColor ?? style.fgColor;
  const centre = style.dotColor ?? eye;
  return [
    style.fgColor,
    eye,
    centre,
    ...EYE_POSITIONS.flatMap((position) => [
      style.eyeColors?.[position]?.outer,
      style.eyeColors?.[position]?.inner,
    ]),
  ].flatMap(colorsOf);
}

/** The scan score's contrast check with `bgColor` behind the code. */
function scanContrast(style: QRStyle, bgColor: ColorConfig) {
  return getScanContrast({
    value: CANONICAL_ORIGIN,
    bgColor,
    fgColor: style.fgColor,
    eyeColor: style.eyeColor,
    dotColor: style.dotColor,
    eyeColors: style.eyeColors,
  });
}

/**
 * Whether `color` behind the code passes the editor's contrast checks: at
 * least 4.5:1 against every color the code is drawn in (the contrast
 * checker), and the scan score's contrast check, without turning a dark
 * code on light into a light one on dark (or back).
 */
export function backgroundPasses(
  style: Partial<QRStyle>,
  color: string,
): boolean {
  const current = withDefaults(style);
  const ratios = codeColors(current).map((code) =>
    getContrastRatio(code, color),
  );
  if (ratios.some((ratio) => ratio < SCAN_CONTRAST_MIN)) return false;
  const scan = scanContrast(current, color);
  if (scan.ratio < scan.required) return false;
  const before = scanContrast(current, current.bgColor ?? "#ffffff");
  return scan.inverted === before.inverted;
}

const same = (a: string, b: ColorConfig | undefined) => {
  if (!b) return false;
  const paint = normalizeColorConfig(b);
  return paint.type === "solid" && paint.color.toLowerCase() === a;
};

/** Another background color from BACKGROUND_SWATCHES that passes, or null. */
export function randomBackground(
  style: Partial<QRStyle>,
  random: Random,
): Pick<QRStyle, "bgColor"> | null {
  const current = withDefaults(style);
  const chosen = pickOne(
    BACKGROUND_SWATCHES.filter(
      (color) =>
        !same(color, current.bgColor) && backgroundPasses(current, color),
    ),
    random,
  );
  return chosen ? { bgColor: chosen } : null;
}

// ── Frame ──────────────────────────────────────────────────────────────────

/** The built-in frames Random picks from (the engine's catalogue). */
export const RANDOM_FRAME_STYLES: BuiltInFrameStyle[] = BUILT_IN_FRAMES.map(
  (frame) => frame.style,
);

/** The frame's main text, wherever it keeps it. */
function frameText(frame: AnyQRFrame): string | undefined {
  if (frame.text !== undefined) return frame.text;
  if (frame.style !== "custom") return;
  return frame.spec.labels.find((label) => label.slot === "primary")?.text;
}

/**
 * Another built-in frame style, keeping the frame's text (and its colors
 * and text size, as the frame picker does). Without a frame (None picked
 * during the edit) any built-in style, with the text it had.
 */
export function randomFrame(
  frame: AnyQRFrame | undefined,
  random: Random,
): AnyQRFrame {
  const style = frame?.style ?? "none";
  const chosen =
    pickOne(
      RANDOM_FRAME_STYLES.filter((option) => option !== style),
      random,
    ) ?? RANDOM_FRAME_STYLES[0];
  const text = frame ? frameText(frame) : undefined;
  return {
    ...(frame ? carryFrameSettings(frame) : {}),
    ...(text !== undefined && { text }),
    style: chosen,
  } as AnyQRFrame;
}
