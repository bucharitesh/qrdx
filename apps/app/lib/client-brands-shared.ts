// Client-safe parts of client brands (lib/client-brands.ts): a client's
// name, logo and accent color, shown on shared stats pages, and the
// workspace's own branding for its client portal. Both are brand_kit rows.

/** A brand as the app passes it around. */
export interface ClientBrand {
  id: string;
  name: string;
  /** An upload served by QRdx or an https image URL; null: the initial */
  logo: string | null;
  /** "#rrggbb", or null for the monochrome look */
  accent: string | null;
}

export const BRAND_NAME_MAX = 80;
/** More than enough for any agency's client list. */
export const CLIENT_BRANDS_MAX = 500;

const HEX = /^#?([0-9a-f]{6})$/i;
const SHORT_HEX = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i;

/** "#AbC" or "aabbcc" → "#aabbcc"; null for anything that isn't a hex color. */
export function normalizeAccent(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const short = SHORT_HEX.exec(trimmed);
  if (short) {
    const [, r, g, b] = short;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  const full = HEX.exec(trimmed);
  return full ? `#${full[1]?.toLowerCase()}` : null;
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.039_28 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of "#rrggbb" (0 black … 1 white). */
export function luminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

const contrast = (a: number, b: number) =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

// The app's backgrounds: white in light mode, neutral-950 in dark mode.
const LIGHT_BACKGROUND = 1;
const DARK_BACKGROUND = luminance("#0a0a0a");
/** WCAG's minimum for graphics (chart lines, rules). */
const GRAPHIC_CONTRAST = 3;

/**
 * Where the accent may color lines and small marks: an accent too pale
 * for a white page, or too dark for a black one, gives way to the text
 * color in that theme, so a client's color never makes a chart unreadable.
 */
export function accentUse(accent: string | null): {
  light: boolean;
  dark: boolean;
  /** Text on a tile filled with the accent */
  onAccent: "#000000" | "#ffffff";
} {
  if (!accent) return { light: false, dark: false, onAccent: "#ffffff" };
  const l = luminance(accent);
  return {
    light: contrast(l, LIGHT_BACKGROUND) >= GRAPHIC_CONTRAST,
    dark: contrast(l, DARK_BACKGROUND) >= GRAPHIC_CONTRAST,
    onAccent: contrast(l, 0) >= contrast(l, 1) ? "#000000" : "#ffffff",
  };
}

/** Why `name` can't be a brand name, or null. */
export function brandNameProblem(name: string): string | null {
  if (!name.trim()) return "Enter a name.";
  if (name.trim().length > BRAND_NAME_MAX) {
    return `Keep the name under ${BRAND_NAME_MAX} characters.`;
  }
  return null;
}
