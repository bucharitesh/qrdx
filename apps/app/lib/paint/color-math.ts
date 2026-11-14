// Color math for the paint picker: conversions between RGB, HSL and HSB
// (HSV), hex with alpha, and parsing of the CSS colors people paste. Pure
// and client-safe; the picker keeps HSB as its working model so hue and
// saturation survive dragging through black, white and grey.

/** sRGB channels 0–255, alpha 0–1. */
export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Hue 0–360, saturation and brightness (value) 0–100, alpha 0–1. */
export interface HSBA {
  h: number;
  s: number;
  b: number;
  a: number;
}

/** Hue 0–360, saturation and lightness 0–100, alpha 0–1. */
export interface HSLA {
  h: number;
  s: number;
  l: number;
  a: number;
}

export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

/** Rounds to `digits` decimals, never -0. */
export const round = (value: number, digits = 0) => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale + 0;
};

const wrapHue = (hue: number) => ((hue % 360) + 360) % 360;

export function rgbToHsb({ r, g, b, a }: RGBA): HSBA {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let h = 0;
  if (delta > 0) {
    if (max === red) h = ((green - blue) / delta) % 6;
    else if (max === green) h = (blue - red) / delta + 2;
    else h = (red - green) / delta + 4;
    h *= 60;
  }
  return {
    h: wrapHue(h),
    s: max === 0 ? 0 : (delta / max) * 100,
    b: max * 100,
    a,
  };
}

export function hsbToRgb({ h, s, b, a }: HSBA): RGBA {
  const value = clamp(b, 0, 100) / 100;
  const saturation = clamp(s, 0, 100) / 100;
  const chroma = value * saturation;
  const hue = wrapHue(h) / 60;
  const x = chroma * (1 - Math.abs((hue % 2) - 1));
  const [r1, g1, b1] =
    hue < 1
      ? [chroma, x, 0]
      : hue < 2
        ? [x, chroma, 0]
        : hue < 3
          ? [0, chroma, x]
          : hue < 4
            ? [0, x, chroma]
            : hue < 5
              ? [x, 0, chroma]
              : [chroma, 0, x];
  const m = value - chroma;
  return {
    r: (r1 + m) * 255,
    g: (g1 + m) * 255,
    b: (b1 + m) * 255,
    a: clamp(a, 0, 1),
  };
}

export function rgbToHsl({ r, g, b, a }: RGBA): HSLA {
  const { h } = rgbToHsb({ r, g, b, a });
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const l = (max + min) / 2;
  const delta = max - min;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return { h, s: s * 100, l: l * 100, a };
}

export function hslToRgb({ h, s, l, a }: HSLA): RGBA {
  const lightness = clamp(l, 0, 100) / 100;
  const saturation = clamp(s, 0, 100) / 100;
  // HSL → HSB: v = l + s·min(l, 1 − l)
  const value = lightness + saturation * Math.min(lightness, 1 - lightness);
  const sb = value === 0 ? 0 : 2 * (1 - lightness / value);
  return hsbToRgb({ h, s: sb * 100, b: value * 100, a });
}

const hex2 = (value: number) =>
  Math.round(clamp(value, 0, 255))
    .toString(16)
    .padStart(2, "0");

/**
 * "#rrggbb", or "#rrggbbaa" when the color is see-through (`alpha: false`
 * drops alpha). Lowercase, as the engine writes it.
 */
export function toHex(color: RGBA, { alpha = true } = {}): string {
  const base = `#${hex2(color.r)}${hex2(color.g)}${hex2(color.b)}`;
  const a = Math.round(clamp(color.a, 0, 1) * 255);
  return alpha && a < 255 ? `${base}${hex2(a)}` : base;
}

const NAMED: Record<string, string> = {
  black: "#000000",
  white: "#ffffff",
  red: "#ff0000",
  green: "#008000",
  lime: "#00ff00",
  blue: "#0000ff",
  navy: "#000080",
  yellow: "#ffff00",
  orange: "#ffa500",
  purple: "#800080",
  pink: "#ffc0cb",
  gray: "#808080",
  grey: "#808080",
  silver: "#c0c0c0",
  maroon: "#800000",
  olive: "#808000",
  teal: "#008080",
  aqua: "#00ffff",
  cyan: "#00ffff",
  fuchsia: "#ff00ff",
  magenta: "#ff00ff",
};

/** A channel: a number, or a percentage of `max`. */
function channel(raw: string, max: number): number {
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) return Number.NaN;
  return raw.trim().endsWith("%") ? (value / 100) * max : value;
}

/** Degrees from a CSS angle (deg, rad, grad, turn or a bare number). */
function hueOf(raw: string): number {
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) return Number.NaN;
  const unit = raw.trim().replace(/^[-+.\d]+/, "");
  if (unit === "rad") return (value * 180) / Math.PI;
  if (unit === "grad") return value * 0.9;
  if (unit === "turn") return value * 360;
  return value;
}

/** The arguments of a CSS color function: legacy commas or modern spaces. */
function args(body: string): { values: string[]; alpha?: string } | null {
  const [main, slashAlpha, extra] = body.split("/");
  if (extra !== undefined) return null;
  const values = main
    .trim()
    .split(/\s*,\s*|\s+/)
    .filter(Boolean);
  if (slashAlpha !== undefined) {
    if (values.length !== 3) return null;
    return { values, alpha: slashAlpha.trim() };
  }
  if (values.length === 4)
    return { values: values.slice(0, 3), alpha: values[3] };
  return values.length === 3 ? { values } : null;
}

const alphaOf = (raw: string | undefined) =>
  raw === undefined ? 1 : clamp(channel(raw, 1), 0, 1);

/**
 * Parses hex (3, 4, 6 or 8 digits, with or without "#"), rgb()/rgba(),
 * hsl()/hsla(), hsb()/hsv(), `transparent` and common color names. Returns
 * null for anything else (the picker then asks the browser, see
 * parseCssColor in the picker).
 */
export function parseColorString(input: string): RGBA | null {
  const value = input.trim().toLowerCase();
  if (!value) return null;
  if (value === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  const named = NAMED[value];
  if (named) return parseColorString(named);

  const hex = value.startsWith("#") ? value.slice(1) : value;
  if (/^(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(hex)) {
    const full =
      hex.length <= 4
        ? hex
            .split("")
            .map((char) => char + char)
            .join("")
        : hex;
    return {
      r: Number.parseInt(full.slice(0, 2), 16),
      g: Number.parseInt(full.slice(2, 4), 16),
      b: Number.parseInt(full.slice(4, 6), 16),
      a: full.length === 8 ? Number.parseInt(full.slice(6, 8), 16) / 255 : 1,
    };
  }

  const fn = /^(rgba?|hsla?|hsba?|hsva?)\(([^)]*)\)$/.exec(value);
  if (!fn) return null;
  const parsed = args(fn[2] as string);
  if (!parsed) return null;
  const [x, y, z] = parsed.values as [string, string, string];
  const a = alphaOf(parsed.alpha);
  if (Number.isNaN(a)) return null;
  const name = fn[1] as string;
  if (name.startsWith("rgb")) {
    const [r, g, b] = [x, y, z].map((part) => channel(part, 255));
    if ([r, g, b].some((part) => Number.isNaN(part))) return null;
    return {
      r: clamp(r as number, 0, 255),
      g: clamp(g as number, 0, 255),
      b: clamp(b as number, 0, 255),
      a,
    };
  }
  const h = hueOf(x);
  const s = Number.parseFloat(y);
  const third = Number.parseFloat(z);
  if ([h, s, third].some((part) => !Number.isFinite(part))) return null;
  return name.startsWith("hsl")
    ? hslToRgb({ h, s, l: third, a })
    : hsbToRgb({ h, s, b: third, a });
}

export type ColorModel = "hex" | "rgb" | "hsl" | "hsb";

export interface ChannelSpec {
  key: string;
  label: string;
  max: number;
}

/** Per-channel fields each model shows (hex is one text field). */
export const MODEL_CHANNELS: Record<
  Exclude<ColorModel, "hex">,
  ChannelSpec[]
> = {
  rgb: [
    { key: "r", label: "Red", max: 255 },
    { key: "g", label: "Green", max: 255 },
    { key: "b", label: "Blue", max: 255 },
  ],
  hsl: [
    { key: "h", label: "Hue", max: 360 },
    { key: "s", label: "Saturation", max: 100 },
    { key: "l", label: "Lightness", max: 100 },
  ],
  hsb: [
    { key: "h", label: "Hue", max: 360 },
    { key: "s", label: "Saturation", max: 100 },
    { key: "b", label: "Brightness", max: 100 },
  ],
};

/** Rounded channel values of `color` in `model`, keyed like MODEL_CHANNELS. */
export function channelsOf(
  color: HSBA,
  model: Exclude<ColorModel, "hex">,
): Record<string, number> {
  if (model === "hsb") {
    return { h: round(color.h), s: round(color.s), b: round(color.b) };
  }
  const rgb = hsbToRgb(color);
  if (model === "rgb") {
    return { r: round(rgb.r), g: round(rgb.g), b: round(rgb.b) };
  }
  const hsl = rgbToHsl(rgb);
  // Keep the hue the picker holds (grey has no hue of its own)
  return { h: round(color.h), s: round(hsl.s), l: round(hsl.l) };
}

/** `color` with one channel of `model` set to `value` (clamped). */
export function withChannel(
  color: HSBA,
  model: Exclude<ColorModel, "hex">,
  key: string,
  value: number,
): HSBA {
  const spec = MODEL_CHANNELS[model].find((item) => item.key === key);
  if (!spec || !Number.isFinite(value)) return color;
  const next = clamp(value, 0, spec.max);
  if (model === "hsb") return { ...color, [key]: next };
  if (model === "rgb") {
    const rgb = { ...hsbToRgb(color), [key]: next };
    const hsb = rgbToHsb(rgb);
    // A grey keeps the hue it had
    return hsb.s === 0 ? { ...hsb, h: color.h } : hsb;
  }
  const hsl = { ...rgbToHsl(hsbToRgb(color)), h: color.h, [key]: next };
  const hsb = rgbToHsb(hslToRgb(hsl));
  return hsb.s === 0 || hsb.b === 0 ? { ...hsb, h: hsl.h } : hsb;
}

/** HSBA for a CSS color, keeping `previousHue` when the color is grey. */
export function toHsba(color: RGBA, previousHue = 0): HSBA {
  const hsb = rgbToHsb(color);
  return hsb.s === 0 || hsb.b === 0 ? { ...hsb, h: previousHue } : hsb;
}

/** Hex (with alpha when see-through) for the picker's working color. */
export const hsbaToHex = (color: HSBA) => toHex(hsbToRgb(color));

/** True when two colors print the same hex (alpha included). */
export const sameColor = (a: string, b: string) => {
  const x = parseColorString(a);
  const y = parseColorString(b);
  return Boolean(x && y && toHex(x) === toHex(y));
};
