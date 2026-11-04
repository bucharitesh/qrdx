// Swatches for the paint picker: colors already in the design, recent and
// saved colors kept in this browser (localStorage), the theme's palette and
// a short set of defaults that scan. Stored colors are hex with alpha.
import { type ColorConfig, normalizeColorConfig } from "qrdx/types";
import type { QRStyle } from "@/types/theme";
import { parseColorString, toHex } from "./color-math";
import type { PaintRole } from "./contrast";

export const RECENT_KEY = "qrdx:paint:recent";
export const SAVED_KEY = "qrdx:paint:saved";
export const RECENT_MAX = 10;
export const SAVED_MAX = 20;

/** Hex for any color string, or null when it doesn't parse. */
export function swatchHex(color: string): string | null {
  const parsed = parseColorString(color);
  return parsed ? toHex(parsed) : null;
}

/** Every color in a paint (each gradient stop). */
export function paintColors(paint: ColorConfig | undefined): string[] {
  if (paint === undefined) return [];
  const normalized = normalizeColorConfig(paint);
  return normalized.type === "solid"
    ? [normalized.color]
    : normalized.stops.map((stop) => stop.color);
}

/** Unique hex colors, first seen first. */
export function uniqueHex(colors: (string | undefined | null)[]): string[] {
  const seen = new Set<string>();
  for (const color of colors) {
    const hex = color ? swatchHex(color) : null;
    if (hex) seen.add(hex);
  }
  return [...seen];
}

/**
 * Colors the design already uses: background, code, eyes and eye centres
 * (every stop), per-eye colors, the frame's colors and the logo's plate.
 */
export function designColors(style: Partial<QRStyle>): string[] {
  const frame = style.frame as
    | { color?: string; textColor?: string; secondaryColor?: string }
    | undefined;
  const eyes = Object.values(style.eyeColors ?? {}).flatMap((eye) => [
    ...paintColors(eye?.outer),
    ...paintColors(eye?.inner),
  ]);
  return uniqueHex([
    ...paintColors(style.bgColor),
    ...paintColors(style.fgColor),
    ...paintColors(style.eyeColor),
    ...paintColors(style.dotColor),
    ...eyes,
    frame?.color,
    frame?.textColor,
    frame?.secondaryColor,
    style.logoOptions?.plate,
  ]).slice(0, 12);
}

/**
 * Defaults to start from: dark tones for the code and light ones for the
 * background, each at least 4.5:1 against white (code) or black text
 * (background), plus black and white.
 */
export const DEFAULT_SWATCHES: Record<PaintRole | "any", string[]> = {
  code: [
    "#000000",
    "#1f2937",
    "#1e3a8a",
    "#1d4ed8",
    "#0f766e",
    "#166534",
    "#7c2d12",
    "#9f1239",
    "#6d28d9",
    "#374151",
  ],
  background: [
    "#ffffff",
    "#f8fafc",
    "#f5f5f4",
    "#fef3c7",
    "#ecfccb",
    "#e0f2fe",
    "#ede9fe",
    "#fce7f3",
    "#ffedd5",
    "#e2e8f0",
  ],
  any: [
    "#000000",
    "#ffffff",
    "#1f2937",
    "#e5e7eb",
    "#1d4ed8",
    "#0f766e",
    "#b45309",
    "#be123c",
    "#6d28d9",
    "#f8fafc",
  ],
};

function read(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? uniqueHex(parsed.filter((item) => typeof item === "string"))
      : [];
  } catch {
    return [];
  }
}

function write(key: string, colors: string[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(colors));
  } catch {
    // Private mode or storage full: swatches just don't persist
  }
  try {
    window.dispatchEvent(new CustomEvent("qrdx:swatches", { detail: key }));
  } catch {
    // No window (tests on a server)
  }
}

export const readRecent = () => read(RECENT_KEY).slice(0, RECENT_MAX);
export const readSaved = () => read(SAVED_KEY).slice(0, SAVED_MAX);

/** `color` moved to the front of `list`, capped at `max`. */
export function pushFront(list: string[], color: string, max: number) {
  const hex = swatchHex(color);
  if (!hex) return list;
  return [hex, ...list.filter((item) => item !== hex)].slice(0, max);
}

/** Remembers colors as recently used (most recent first). */
export function addRecent(colors: string[]) {
  let list = readRecent();
  for (const color of [...colors].reverse()) {
    list = pushFront(list, color, RECENT_MAX);
  }
  write(RECENT_KEY, list);
  return list;
}

/** Saves `color`, or removes it when it is already saved. */
export function toggleSaved(color: string): string[] {
  const hex = swatchHex(color);
  if (!hex) return readSaved();
  const saved = readSaved();
  const next = saved.includes(hex)
    ? saved.filter((item) => item !== hex)
    : [...saved, hex].slice(-SAVED_MAX);
  write(SAVED_KEY, next);
  return next;
}

export function removeSaved(color: string): string[] {
  const hex = swatchHex(color);
  const next = readSaved().filter((item) => item !== hex);
  write(SAVED_KEY, next);
  return next;
}
