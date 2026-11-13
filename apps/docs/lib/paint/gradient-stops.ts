// Stop editing for the paint picker's gradient bar. Stops keep their order
// in the array while dragged (so the selected index stays put); the color at
// an offset blends neighbours the way the engine and CSS do (premultiplied
// sRGB), so a new stop lands on the color already there.
import { MAX_GRADIENT_STOPS } from "@repo/config";
import type { GradientStop } from "qrdx/types";
import { clamp, parseColorString, type RGBA, round, toHex } from "./color-math";

/** Fewest stops a gradient keeps (the engine needs two). */
export const MIN_STOPS = 2;

const BLACK: RGBA = { r: 0, g: 0, b: 0, a: 1 };

/** Stops by offset, with their index in `stops`. */
export function sortedStops(stops: GradientStop[]) {
  return stops
    .map((stop, index) => ({ ...stop, index }))
    .sort((a, b) => a.offset - b.offset || a.index - b.index);
}

/** The color at `offset` (0–100), blended like CSS and the engine. */
export function colorAtOffset(stops: GradientStop[], offset: number): RGBA {
  const sorted = sortedStops(stops);
  const first = sorted[0];
  const last = sorted.at(-1);
  if (!(first && last)) return BLACK;
  const parse = (color: string) => parseColorString(color) ?? BLACK;
  if (offset <= first.offset) return parse(first.color);
  if (offset >= last.offset) return parse(last.color);
  for (let i = 0; i + 1 < sorted.length; i++) {
    const from = sorted[i] as (typeof sorted)[number];
    const to = sorted[i + 1] as (typeof sorted)[number];
    if (offset < from.offset || offset > to.offset) continue;
    const span = to.offset - from.offset;
    const k = span > 0 ? (offset - from.offset) / span : 1;
    const c0 = parse(from.color);
    const c1 = parse(to.color);
    const a = c0.a + (c1.a - c0.a) * k;
    const mix = (x: number, y: number) => {
      const premultiplied = x * c0.a + (y * c1.a - x * c0.a) * k;
      return a > 0 ? premultiplied / a : x + (y - x) * k;
    };
    return { r: mix(c0.r, c1.r), g: mix(c0.g, c1.g), b: mix(c0.b, c1.b), a };
  }
  return parse(last.color);
}

/**
 * A new stop at `offset`, colored as the gradient is there. Returns the
 * stops and the new stop's index, or null at MAX_GRADIENT_STOPS.
 */
export function addStop(
  stops: GradientStop[],
  offset: number,
): { stops: GradientStop[]; index: number } | null {
  if (stops.length >= MAX_GRADIENT_STOPS) return null;
  const at = round(clamp(offset, 0, 100), 1);
  const color = toHex(colorAtOffset(stops, at));
  return { stops: [...stops, { color, offset: at }], index: stops.length };
}

/** Removes the stop at `index` unless only MIN_STOPS are left. */
export function removeStop(
  stops: GradientStop[],
  index: number,
): { stops: GradientStop[]; index: number } | null {
  if (stops.length <= MIN_STOPS || !stops[index]) return null;
  const next = stops.filter((_, i) => i !== index);
  // Select the neighbour nearest the removed stop's position
  const removed = stops[index] as GradientStop;
  let nearest = 0;
  next.forEach((stop, i) => {
    const best = next[nearest] as GradientStop;
    if (
      Math.abs(stop.offset - removed.offset) <
      Math.abs(best.offset - removed.offset)
    ) {
      nearest = i;
    }
  });
  return { stops: next, index: nearest };
}

/** The stop at `index` moved to `offset` (0–100, one decimal). */
export function moveStop(
  stops: GradientStop[],
  index: number,
  offset: number,
): GradientStop[] {
  return stops.map((stop, i) =>
    i === index ? { ...stop, offset: round(clamp(offset, 0, 100), 1) } : stop,
  );
}

/** The stop at `index` with a new color. */
export function setStopColor(
  stops: GradientStop[],
  index: number,
  color: string,
): GradientStop[] {
  return stops.map((stop, i) => (i === index ? { ...stop, color } : stop));
}

/** Every stop mirrored (offset → 100 − offset), in order by offset. */
export function reverseStops(stops: GradientStop[]): GradientStop[] {
  return stops
    .map((stop) => ({ ...stop, offset: round(100 - stop.offset, 1) }))
    .sort((a, b) => a.offset - b.offset);
}

/** Stops sorted by offset, as the engine and the API store them. */
export const normalizeStops = (stops: GradientStop[]): GradientStop[] =>
  sortedStops(stops).map(({ color, offset }) => ({ color, offset }));

/** `angle` plus `delta`, kept in 0–359. */
export const rotateAngle = (angle: number, delta: number) =>
  ((Math.round(angle + delta) % 360) + 360) % 360;

/** The index in `normalizeStops(stops)` of the stop at `index` in `stops`. */
export function sortedIndex(stops: GradientStop[], index: number): number {
  return sortedStops(stops).findIndex((stop) => stop.index === index);
}
