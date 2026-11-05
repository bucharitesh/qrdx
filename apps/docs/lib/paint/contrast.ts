// QR safety for the paint picker: the contrast a color gets against the
// rest of the design, judged by the scan score's own check
// (getScanContrast and its thresholds), and a one-click fix that moves the
// color just far enough to pass.
import {
  type ColorConfig,
  getScanContrast,
  type ImagePaint,
  type ImageToneMap,
  normalizeColorConfig,
  SCAN_CONTRAST_FAIL,
  SCAN_CONTRAST_LOW,
  SCAN_CONTRAST_MIN,
} from "qrdx";
import type { QRStyle } from "@/types/theme";
import {
  hslToRgb,
  parseColorString,
  type RGBA,
  rgbToHsl,
  toHex,
} from "./color-math";

/** What a picked color paints: the light background or the dark code. */
export type PaintRole = "background" | "code";

/** The role of a color control by its name (the focus-store ids). */
export function roleOf(name: string | undefined): PaintRole | null {
  if (!name) return null;
  if (name === "bgColor") return "background";
  if (
    name === "fgColor" ||
    name === "eyeColor" ||
    name === "dotColor" ||
    name.startsWith("eyeColors.")
  ) {
    return "code";
  }
  return null;
}

export type SafetyLevel = "good" | "low" | "poor" | "fails";

export interface PaintSafety {
  /** Worst contrast ratio (≥ 1), rounded to one decimal */
  ratio: number;
  /** What it needs: 4.5:1 for colors, more with a picture (the scan score's) */
  required: number;
  level: SafetyLevel;
  /** A code color lighter than the background */
  inverted: boolean;
}

const SAMPLE_VALUE = "https://qrdx.dev";

/** Props holding only the colors the contrast check compares. */
function contrastProps(
  role: PaintRole,
  paint: ColorConfig,
  style: Partial<QRStyle>,
) {
  if (role === "code") {
    // This color against the background, alone
    return {
      value: SAMPLE_VALUE,
      bgColor: style.bgColor,
      fgColor: paint,
      eyeColor: paint,
      dotColor: paint,
    };
  }
  return {
    value: SAMPLE_VALUE,
    bgColor: paint,
    fgColor: style.fgColor,
    eyeColor: style.eyeColor,
    dotColor: style.dotColor,
    eyeColors: style.eyeColors,
  };
}

/**
 * The level the scan score gives a contrast ratio. Its lines scale with
 * what the pair needs (`required`: 4.5:1 for colors, more with a picture).
 */
export function levelOf(
  ratio: number,
  required: number = SCAN_CONTRAST_MIN,
): SafetyLevel {
  const scale = required / SCAN_CONTRAST_MIN;
  if (ratio >= required) return "good";
  if (ratio >= SCAN_CONTRAST_LOW * scale) return "low";
  if (ratio >= SCAN_CONTRAST_FAIL * scale) return "poor";
  return "fails";
}

/**
 * How `paint` in `role` scans with the rest of `style`: the scan score's
 * contrast check, with this color in place.
 */
export function paintSafety(
  role: PaintRole,
  paint: ColorConfig,
  style: Partial<QRStyle>,
  imageTones?: ImageToneMap,
): PaintSafety {
  const { ratio, inverted, required } = getScanContrast(
    contrastProps(role, paint, style),
    { imageTones },
  );
  const finite = Number.isFinite(ratio) ? ratio : 21;
  return {
    ratio: Math.round(finite * 10) / 10,
    required,
    level: levelOf(finite, required),
    inverted,
  };
}

/**
 * Short copy for the warning chip (the ratio shows beside it), or null when
 * the color scans well.
 */
export function safetyMessage(safety: PaintSafety): string | null {
  if (safety.level === "fails") return "Won't scan";
  if (safety.inverted) return "Light on dark";
  if (safety.level === "poor") return "Hard to scan";
  if (safety.level === "low") return "May scan poorly";
  return null;
}

/** The chip's longer explanation (its title and screen reader text). */
export function safetyDetail(safety: PaintSafety): string | null {
  if (safety.level === "fails") return "Too little contrast for any scanner.";
  if (safety.inverted) {
    return "Light code on a dark background: some scanner apps can't read it.";
  }
  if (safety.level === "poor" || safety.level === "low") {
    return safety.required === SCAN_CONTRAST_MIN
      ? "4.5:1 or more scans reliably."
      : `A picture's detail reads as noise: ${safety.required}:1 or more scans reliably.`;
  }
  return null;
}

/** A fix aims a little over the pass line, so rounding holds. */
const MARGIN = 0.1;

/**
 * `color` moved in lightness (hue and saturation kept, made opaque first)
 * just far enough that `passes` holds: darker for the code, lighter for the
 * background. Null when even black (or white) doesn't pass.
 */
function nudge(
  color: string,
  role: PaintRole,
  passes: (candidate: string) => boolean,
): string | null {
  const parsed = parseColorString(color);
  if (!parsed) return null;
  const opaque: RGBA = { ...parsed, a: 1 };
  if (passes(toHex(opaque))) return toHex(opaque);
  const hsl = rgbToHsl(opaque);
  const end = role === "code" ? 0 : 100;
  const at = (l: number) => toHex(hslToRgb({ ...hsl, l }));
  if (!passes(at(end))) return null;
  // Binary search for the lightness nearest the original that passes
  let good = end;
  let bad = hsl.l;
  for (let i = 0; i < 24; i++) {
    const mid = (good + bad) / 2;
    if (passes(at(mid))) good = mid;
    else bad = mid;
  }
  return at(good);
}

/**
 * The smallest change to `paint` that passes the scan score's contrast
 * check (4.5:1) with the rest of `style`: each color (each gradient stop)
 * made opaque, then darkened (code) or lightened (background) as little as
 * needed. Null when this color alone can't get there (the other side is too
 * close: fix that one instead).
 */
export function makeScannable(
  role: PaintRole,
  paint: ColorConfig,
  style: Partial<QRStyle>,
  imageTones?: ImageToneMap,
): ColorConfig | null {
  const normalized = normalizeColorConfig(paint);
  const passesPaint = (candidate: ColorConfig) => {
    const { ratio, inverted, required } = getScanContrast(
      contrastProps(role, candidate, style),
      { imageTones },
    );
    return ratio >= required + MARGIN && !inverted;
  };
  const passes = (candidate: string) => passesPaint(candidate);
  if (normalized.type === "image") {
    return fadePicture(role, normalized, passesPaint, imageTones);
  }
  if (normalized.type === "solid") {
    return nudge(normalized.color, role, passes);
  }
  const stops = normalized.stops.map((stop) => ({
    ...stop,
    color: nudge(stop.color, role, passes),
  }));
  if (stops.some((stop) => stop.color === null)) return null;
  return {
    ...normalized,
    stops: stops.map((stop) => ({ ...stop, color: stop.color as string })),
  };
}

/**
 * A picture made scannable: over a dark underlay for the code (or a light
 * one for the background), at the highest opacity that passes. A picture
 * whose tones aren't known yet can't be fixed (null).
 */
function fadePicture(
  role: PaintRole,
  paint: ImagePaint,
  passes: (candidate: ColorConfig) => boolean,
  imageTones?: ImageToneMap,
): ImagePaint | null {
  if (!imageTones?.[paint.src]) return null;
  const underlay = role === "code" ? "#000000" : "#ffffff";
  const at = (opacity: number): ImagePaint => ({
    ...paint,
    underlay,
    opacity: Math.round(opacity * 100) / 100,
  });
  if (passes(at(paint.opacity ?? 1)) && paint.underlay === underlay) {
    return at(paint.opacity ?? 1);
  }
  if (!passes(at(0))) return null;
  let good = 0;
  let bad = Math.min(1, paint.opacity ?? 1);
  if (passes(at(bad))) return at(bad);
  for (let i = 0; i < 16; i++) {
    const mid = (good + bad) / 2;
    if (passes(at(mid))) good = mid;
    else bad = mid;
  }
  return at(Math.floor(good * 100) / 100);
}
