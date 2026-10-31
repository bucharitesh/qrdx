/** biome-ignore-all lint/style/noMagicNumbers: color math */

export interface RGBAColor {
  r: number;
  g: number;
  b: number;
  /** 0 (transparent) to 1 (opaque) */
  a: number;
}

const NAMED_COLORS: Record<string, [number, number, number]> = {
  black: [0, 0, 0],
  white: [255, 255, 255],
  red: [255, 0, 0],
  green: [0, 128, 0],
  lime: [0, 255, 0],
  blue: [0, 0, 255],
  navy: [0, 0, 128],
  yellow: [255, 255, 0],
  orange: [255, 165, 0],
  purple: [128, 0, 128],
  pink: [255, 192, 203],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
  silver: [192, 192, 192],
  maroon: [128, 0, 0],
  olive: [128, 128, 0],
  teal: [0, 128, 128],
  aqua: [0, 255, 255],
  cyan: [0, 255, 255],
  fuchsia: [255, 0, 255],
  magenta: [255, 0, 255],
};

function parseChannel(value: string, max: number): number {
  const trimmed = value.trim();
  const number = Number.parseFloat(trimmed);
  if (Number.isNaN(number)) {
    return Number.NaN;
  }
  return trimmed.endsWith("%") ? (number / 100) * max : number;
}

/**
 * Parses hex (#rgb, #rgba, #rrggbb, #rrggbbaa), rgb()/rgba(), `transparent`
 * and common color names. Returns null for anything else.
 */
export function parseColor(input: string | null | undefined): RGBAColor | null {
  if (!input) {
    return null;
  }
  const value = input.trim().toLowerCase();

  if (value === "transparent") {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  const named = NAMED_COLORS[value];
  if (named) {
    return { r: named[0], g: named[1], b: named[2], a: 1 };
  }

  if (value.startsWith("#")) {
    let hex = value.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      hex = hex
        .split("")
        .map((char) => char + char)
        .join("");
    }
    if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/.test(hex)) {
      return null;
    }
    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
      a: hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1,
    };
  }

  const fn = /^rgba?\(([^)]*)\)$/.exec(value);
  if (fn) {
    const [channels, alpha] = fn[1].split("/");
    const parts = channels.split(/[\s,]+/).filter(Boolean);
    const alphaPart = alpha ?? parts[3];
    const [r, g, b] = parts.slice(0, 3).map((part) => parseChannel(part, 255));
    const a = alphaPart === undefined ? 1 : parseChannel(alphaPart, 1);
    if ([r, g, b, a].some((channel) => Number.isNaN(channel))) {
      return null;
    }
    const clamp = (channel: number, max: number) =>
      Math.min(Math.max(channel, 0), max);
    return {
      r: clamp(r, 255),
      g: clamp(g, 255),
      b: clamp(b, 255),
      a: clamp(a, 1),
    };
  }

  return null;
}

/**
 * Naive RGB → CMYK conversion (no ICC profile): K = 1 − max(R, G, B) and
 * C/M/Y from what is left. Pure black maps to K only. Returns 0–1 values.
 * Ask your printer for a proper color-managed conversion when exact brand
 * colors matter.
 */
export function rgbToCmyk(
  r: number,
  g: number,
  b: number
): [c: number, m: number, y: number, k: number] {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const k = 1 - Math.max(red, green, blue);
  if (k >= 1) {
    return [0, 0, 0, 1];
  }
  const round = (value: number) => Math.round(value * 1000) / 1000;
  return [
    round((1 - red - k) / (1 - k)),
    round((1 - green - k) / (1 - k)),
    round((1 - blue - k) / (1 - k)),
    round(k),
  ];
}
