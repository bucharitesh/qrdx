import {
  type BodyPattern,
  type ColorConfig,
  type CornerEyeDotPattern,
  type CornerEyePattern,
  getContrastRatio,
  getLuminance,
  hexToRgb,
  type QRProps,
} from "qrdx";

// A curated subset of the QRdx playground presets (apps/docs/utils/qr-presets.ts),
// each checked to decode with zbar. Kept in sync by hand:
// plugins/chrome/src/presets.ts and plugins/figma/src/presets.ts.
export interface StylePreset {
  id: string;
  label: string;
  bgColor: string;
  fgColor: ColorConfig;
  eyeColor: ColorConfig;
  dotColor: ColorConfig;
  bodyPattern: BodyPattern;
  cornerEyePattern: CornerEyePattern;
  cornerEyeDotPattern: CornerEyeDotPattern;
}

export const PRESETS: readonly StylePreset[] = [
  {
    id: "classic",
    label: "Classic",
    bgColor: "#ffffff",
    fgColor: "#000000",
    eyeColor: "#000000",
    dotColor: "#000000",
    bodyPattern: "circle",
    cornerEyePattern: "gear",
    cornerEyeDotPattern: "circle",
  },
  {
    id: "minimal",
    label: "Minimal",
    bgColor: "#ffffff",
    fgColor: "#404040",
    eyeColor: "#404040",
    dotColor: "#404040",
    bodyPattern: "square",
    cornerEyePattern: "square",
    cornerEyeDotPattern: "square",
  },
  {
    id: "modern",
    label: "Modern",
    bgColor: "#f8fafc",
    fgColor: "#0f172a",
    eyeColor: "#3b82f6",
    dotColor: "#3b82f6",
    bodyPattern: "rounded",
    cornerEyePattern: "rounded",
    cornerEyeDotPattern: "rounded",
  },
  {
    id: "ocean",
    label: "Ocean Blue",
    bgColor: "#eff6ff",
    fgColor: {
      type: "linear",
      angle: 135,
      stops: [
        { color: "#1e40af", offset: 0 },
        { color: "#3b82f6", offset: 100 },
      ],
    },
    eyeColor: "#3b82f6",
    dotColor: "#60a5fa",
    bodyPattern: "circle-large",
    cornerEyePattern: "gear",
    cornerEyeDotPattern: "circle",
  },
  {
    id: "nature",
    label: "Nature",
    bgColor: "#f0fdf4",
    fgColor: "#166534",
    eyeColor: "#15803d",
    dotColor: "#16a34a",
    bodyPattern: "rounded",
    cornerEyePattern: "circle",
    cornerEyeDotPattern: "circle",
  },
  {
    id: "sunset",
    label: "Sunset",
    bgColor: "#fff7ed",
    fgColor: {
      type: "linear",
      angle: 135,
      stops: [
        { color: "#f97316", offset: 0 },
        { color: "#dc2626", offset: 100 },
      ],
    },
    eyeColor: "#ea580c",
    dotColor: "#f97316",
    bodyPattern: "rounded",
    cornerEyePattern: "extra-rounded",
    cornerEyeDotPattern: "rounded",
  },
  {
    id: "lavender",
    label: "Lavender",
    bgColor: "#faf5ff",
    fgColor: "#6b21a8",
    eyeColor: "#a855f7",
    dotColor: "#c084fc",
    bodyPattern: "circle-large",
    cornerEyePattern: "extra-rounded",
    cornerEyeDotPattern: "rounded-triangle",
  },
  {
    id: "caffeine",
    label: "Caffeine",
    bgColor: "#fef3c7",
    fgColor: "#78350f",
    eyeColor: "#92400e",
    dotColor: "#a16207",
    bodyPattern: "rounded",
    cornerEyePattern: "rounded",
    cornerEyeDotPattern: "rounded",
  },
  {
    id: "pastel",
    label: "Pastel Dream",
    bgColor: "#fefce8",
    fgColor: {
      type: "linear",
      angle: 120,
      stops: [
        { color: "#fbbf24", offset: 0 },
        { color: "#f472b6", offset: 50 },
        { color: "#a78bfa", offset: 100 },
      ],
    },
    eyeColor: "#c084fc",
    dotColor: "#f472b6",
    bodyPattern: "rounded",
    cornerEyePattern: "extra-rounded",
    cornerEyeDotPattern: "rounded-triangle",
  },
  {
    id: "midnight",
    label: "Midnight",
    bgColor: "#0f172a",
    fgColor: "#e0e7ff",
    eyeColor: "#6366f1",
    dotColor: "#818cf8",
    bodyPattern: "circle",
    cornerEyePattern: "gear",
    cornerEyeDotPattern: "circle",
  },
  {
    id: "neon",
    label: "Neon",
    bgColor: "#0f172a",
    fgColor: {
      type: "linear",
      angle: 45,
      stops: [
        { color: "#22d3ee", offset: 0 },
        { color: "#a855f7", offset: 50 },
        { color: "#ec4899", offset: 100 },
      ],
    },
    eyeColor: "#a855f7",
    dotColor: "#ec4899",
    bodyPattern: "circle-mixed",
    cornerEyePattern: "rounded",
    cornerEyeDotPattern: "rounded",
  },
  {
    id: "cyberpunk",
    label: "Cyberpunk",
    bgColor: "#030712",
    fgColor: {
      type: "linear",
      angle: 45,
      stops: [
        { color: "#ec4899", offset: 0 },
        { color: "#8b5cf6", offset: 50 },
        { color: "#06b6d4", offset: 100 },
      ],
    },
    eyeColor: "#a855f7",
    dotColor: "#ec4899",
    bodyPattern: "pacman",
    cornerEyePattern: "pointy",
    cornerEyeDotPattern: "star",
  },
];

const DEFAULT_PRESET = PRESETS[0] as StylePreset;

/** The user's look: a preset plus optional solid color overrides. */
export interface QRStyle {
  presetId: string;
  fgColor: string | null;
  bgColor: string | null;
}

export const DEFAULT_STYLE: QRStyle = {
  presetId: DEFAULT_PRESET.id,
  fgColor: null,
  bgColor: null,
};

// Every preset uses error correction level Q; this is its byte-mode capacity.
const LEVEL = "Q";
export const MAX_QR_BYTES = 1663;
// Quiet zone (in modules) so the code scans when placed on other backgrounds.
const MARGIN = 2;
// Below this foreground/background contrast ratio many scanners struggle.
const MIN_CONTRAST = 3;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function getPreset(id: string): StylePreset {
  return PRESETS.find((preset) => preset.id === id) ?? DEFAULT_PRESET;
}

/** A representative solid color: the color itself, or a gradient's first stop. */
function primaryColor(color: ColorConfig): string {
  if (typeof color === "string") return color;
  if (color.type === "solid") return color.color;
  return color.stops[0]?.color ?? "#000000";
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_COLOR.test(value);
}

/** Coerces untrusted stored data into a valid style. */
export function sanitizeStyle(input: unknown): QRStyle {
  if (typeof input !== "object" || input === null) return DEFAULT_STYLE;
  const raw = input as Record<string, unknown>;
  return {
    presetId: getPreset(
      typeof raw.presetId === "string" ? raw.presetId : DEFAULT_PRESET.id
    ).id,
    fgColor: isHexColor(raw.fgColor) ? raw.fgColor.toLowerCase() : null,
    bgColor: isHexColor(raw.bgColor) ? raw.bgColor.toLowerCase() : null,
  };
}

/** The effective foreground and background colors, for pickers and contrast checks. */
export function effectiveColors(style: QRStyle): { fg: string; bg: string } {
  const preset = getPreset(style.presetId);
  return {
    fg: style.fgColor ?? primaryColor(preset.fgColor),
    bg: style.bgColor ?? preset.bgColor,
  };
}

function luminance(hex: string): number {
  const rgb = hexToRgb(hex);
  return rgb ? getLuminance(rgb.r, rgb.g, rgb.b) : 0;
}

/** Scan-readiness hints for the current colors. */
export function checkColors(style: QRStyle) {
  const { fg, bg } = effectiveColors(style);
  const contrast = getContrastRatio(fg, bg);
  return {
    contrast,
    lowContrast: contrast < MIN_CONTRAST,
    // Phone cameras read inverted codes; some older scanner apps don't.
    lightOnDark: luminance(bg) < luminance(fg),
  };
}

export function buildQRProps(value: string, style: QRStyle): QRProps {
  const preset = getPreset(style.presetId);
  const fg = style.fgColor;
  return {
    value,
    level: LEVEL,
    margin: MARGIN,
    bgColor: style.bgColor ?? preset.bgColor,
    fgColor: fg ?? preset.fgColor,
    eyeColor: fg ?? preset.eyeColor,
    dotColor: fg ?? preset.dotColor,
    bodyPattern: preset.bodyPattern,
    cornerEyePattern: preset.cornerEyePattern,
    cornerEyeDotPattern: preset.cornerEyeDotPattern,
  };
}

export function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}
