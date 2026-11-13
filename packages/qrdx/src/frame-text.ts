/** biome-ignore-all lint/style/noMagicNumbers: type metrics */
// What frame specs need to set labels without a DOM: rough letter widths of
// a bold sans-serif (to fit a label to its row), letters set along a circle,
// and opaque color mixes (frames never use transparency, because EPS has
// none).
import type { FrameLabel } from "./frame";
import { parseColor } from "./utils/parse-color";

// ── Text measuring ────────────────────────────────────────────────────────

/** Rough em width of one character in a bold sans-serif. */
export function charEm(char: string): number {
  if (char === " ") {
    return 0.3;
  }
  if (/[MWmw@%]/.test(char)) {
    return 0.92;
  }
  if (/[A-Z0-9#&]/.test(char)) {
    return 0.72;
  }
  if (/[il.,:;!'|1]/.test(char)) {
    return 0.32;
  }
  return 0.6;
}

/** Rough em width of `text` in a bold sans-serif (at least 1). */
export function estimateTextEm(text: string): number {
  let em = 0;
  for (const char of text) {
    em += charEm(char);
  }
  return Math.max(em, 1);
}

// ── Color ─────────────────────────────────────────────────────────────────

const hex = (value: number) =>
  Math.round(Math.min(255, Math.max(0, value)))
    .toString(16)
    .padStart(2, "0");

/**
 * Opaque mix of two colors (`amount` 0 = `from`, 1 = `to`). Frames use solid
 * tints instead of transparency, because EPS has no transparency.
 */
export function mixFrameColors(
  from: string,
  to: string,
  amount: number
): string {
  const a = parseColor(from) ?? { r: 0, g: 0, b: 0, a: 1 };
  const b = parseColor(to) ?? { r: 255, g: 255, b: 255, a: 1 };
  const t = Math.min(1, Math.max(0, amount));
  return `#${hex(a.r + (b.r - a.r) * t)}${hex(a.g + (b.g - a.g) * t)}${hex(a.b + (b.b - a.b) * t)}`;
}

// ── Curved text ───────────────────────────────────────────────────────────

/**
 * Letters of `text` set along a circle of `radius` around (cx, cy): over the
 * top reading clockwise, or along the bottom reading left to right, upright.
 */
export function arcLabels(
  text: string,
  cx: number,
  cy: number,
  radius: number,
  fontSize: number,
  where: "top" | "bottom",
  color: string,
  /** The frame text the letters draw (FrameLabel.field) */
  field: string
): FrameLabel[] {
  const chars = [...text];
  const spacing = fontSize * 0.08;
  const widths = chars.map((char) => charEm(char) * fontSize);
  const total =
    widths.reduce((sum, width) => sum + width, 0) +
    spacing * Math.max(0, chars.length - 1);
  // Center the capitals on `radius`: the baseline sits half a cap height in
  // from the outside of the glyphs.
  const baseline =
    where === "top" ? radius - fontSize * 0.35 : radius + fontSize * 0.35;
  const labels: FrameLabel[] = [];
  let offset = 0;
  chars.forEach((char, index) => {
    const width = widths[index] as number;
    const along = (offset + width / 2) / baseline;
    offset += width + spacing;
    if (char.trim() === "") {
      return;
    }
    const angle =
      where === "top"
        ? -Math.PI / 2 - total / 2 / baseline + along
        : Math.PI / 2 + total / 2 / baseline - along;
    labels.push({
      text: char,
      x: cx + baseline * Math.cos(angle),
      y: cy + baseline * Math.sin(angle),
      fontSize,
      maxWidth: fontSize * 2,
      color,
      rotate: (angle * 180) / Math.PI + (where === "top" ? 90 : -90),
      field,
    });
  });
  return labels;
}
