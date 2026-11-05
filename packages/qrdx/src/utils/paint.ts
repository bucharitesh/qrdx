/** biome-ignore-all lint/style/noMagicNumbers: color and wedge math */
// Paint helpers shared by the SVG renderer and the vector exporters: colors
// with alpha split into a color and an opacity (for SVG consumers that don't
// read 8-digit hex, such as Illustrator), compositing for formats without
// transparency, and the wedge fan that draws an angular (conic) gradient,
// which SVG, PDF and PostScript have no native shading for.
import type { GradientStop } from "../../types/color";
import { fmt, roundTo } from "./fmt";
import { parseColor, type RGBAColor } from "./parse-color";

const hex2 = (value: number) =>
  Math.round(Math.min(Math.max(value, 0), 255))
    .toString(16)
    .padStart(2, "0");

/** "#rrggbb" for a color (alpha dropped). */
export function toHex6(color: RGBAColor): string {
  return `#${hex2(color.r)}${hex2(color.g)}${hex2(color.b)}`;
}

/**
 * A CSS color as an opaque color plus an opacity. Colors without alpha, fully
 * transparent ones ("transparent" stays "transparent") and colors that don't
 * parse come back unchanged, so they render exactly as before.
 */
export function splitAlpha(color: string): {
  color: string;
  opacity?: number;
} {
  const parsed = parseColor(color);
  if (!parsed || parsed.a >= 1 || parsed.a <= 0) {
    return { color };
  }
  return { color: toHex6(parsed), opacity: roundTo(parsed.a, 3) };
}

/** `color` composited over an opaque `backdrop` (straight alpha). */
export function flattenOver(color: RGBAColor, backdrop: RGBAColor): RGBAColor {
  const a = Math.min(Math.max(color.a, 0), 1);
  return {
    r: color.r * a + backdrop.r * (1 - a),
    g: color.g * a + backdrop.g * (1 - a),
    b: color.b * a + backdrop.b * (1 - a),
    a: 1,
  };
}

export interface ParsedStop {
  /** 0–1 */
  offset: number;
  color: RGBAColor;
}

const BLACK: RGBAColor = { r: 0, g: 0, b: 0, a: 1 };

/** Stops sorted by offset, offsets clamped to 0–1, colors parsed. */
export function parseStops(stops: GradientStop[]): ParsedStop[] {
  return [...stops]
    .map((stop) => ({
      offset: Math.min(Math.max(stop.offset / 100, 0), 1),
      color: parseColor(stop.color) ?? BLACK,
    }))
    .sort((a, b) => a.offset - b.offset);
}

/**
 * Color at `t` (0–1) along sorted stops, blended in premultiplied sRGB as
 * CSS and SVG do, so a stop fading to transparent doesn't turn grey.
 */
export function colorAt(stops: ParsedStop[], t: number): RGBAColor {
  const first = stops[0];
  const last = stops.at(-1);
  if (!(first && last)) {
    return BLACK;
  }
  if (t <= first.offset) {
    return first.color;
  }
  if (t >= last.offset) {
    return last.color;
  }
  for (let i = 0; i + 1 < stops.length; i++) {
    const from = stops[i] as ParsedStop;
    const to = stops[i + 1] as ParsedStop;
    if (t >= from.offset && t <= to.offset) {
      const span = to.offset - from.offset;
      const k = span > 0 ? (t - from.offset) / span : 1;
      const a = from.color.a + (to.color.a - from.color.a) * k;
      const mix = (c0: number, c1: number) => {
        const premultiplied =
          c0 * from.color.a + (c1 * to.color.a - c0 * from.color.a) * k;
        return a > 0 ? premultiplied / a : c0 + (c1 - c0) * k;
      };
      return {
        r: mix(from.color.r, to.color.r),
        g: mix(from.color.g, to.color.g),
        b: mix(from.color.b, to.color.b),
        a,
      };
    }
  }
  return last.color;
}

export interface ConicWedge {
  /** Triangle from the centre, as SVG path data */
  d: string;
  /** Opaque "#rrggbb" */
  color: string;
  /** Set when stops differ in alpha: this wedge's own opacity */
  opacity?: number;
  /** Start angle, degrees clockwise from the +x axis (0–360) */
  from: number;
  /** Degrees the wedge covers from `from` (overlap included) */
  sweep: number;
}

export interface ConicFan {
  wedges: ConicWedge[];
  /**
   * Set when every stop shares one alpha below 1: the wedges are opaque and
   * the whole fan is drawn at this opacity (one group, so overlaps don't
   * add up).
   */
  opacity?: number;
}

/** Widest wedge, in degrees: keeps the chord outside the area it covers. */
const MAX_WEDGE_DEGREES = 4;
/** Most wedges in one fan */
const MAX_WEDGES = 720;
/** Largest color step between neighbouring wedges, in 0–255 levels */
const LEVELS_PER_WEDGE = 2;

/**
 * Wedges that draw an angular (conic) gradient around (`cx`, `cy`): each is
 * a thin triangle filled with the gradient's color at its middle angle, as
 * many as the color change needs (about 2 levels per wedge, at most 4° and
 * 720 wedges). `angle` is where the sweep starts, clockwise from the top,
 * as in CSS `conic-gradient(from <angle>deg, …)`; `radius` must reach every
 * point the fan has to cover (1.003 × the farthest point is enough).
 *
 * Anti-aliased renderers (PDF viewers, browsers) blend the background into
 * the seam where two shapes meet edge to edge. So when the stops share one
 * alpha, every wedge reaches one wedge width into the next (and the first
 * one back under the last); painted in order, each seam lies on the solid
 * wedge before it. When stops differ in alpha, wedges carry their own
 * opacity and meet edge to edge, so nothing is painted twice.
 */
export function conicWedges(
  stops: GradientStop[],
  angle: number,
  cx: number,
  cy: number,
  radius: number
): ConicFan {
  const parsed = parseStops(stops);
  if (parsed.length === 0) {
    return { wedges: [] };
  }
  const firstAlpha = (parsed[0] as ParsedStop).color.a;
  const uniform = parsed.every(
    (stop) => Math.abs(stop.color.a - firstAlpha) < 0.002
  );
  // Breakpoints along the turn (0–1): the stops, plus both ends
  const breaks = [
    ...new Set([0, ...parsed.map((stop) => stop.offset), 1]),
  ].sort((a, b) => a - b);

  const spans: [number, number][] = [];
  for (let i = 0; i + 1 < breaks.length; i++) {
    const from = breaks[i] as number;
    const to = breaks[i + 1] as number;
    if (to <= from) {
      continue;
    }
    const c0 = colorAt(parsed, from + 1e-9);
    const c1 = colorAt(parsed, to - 1e-9);
    const delta = Math.max(
      Math.abs(c0.r * c0.a - c1.r * c1.a),
      Math.abs(c0.g * c0.a - c1.g * c1.a),
      Math.abs(c0.b * c0.a - c1.b * c1.a),
      Math.abs(c0.a - c1.a) * 255
    );
    const byColor = Math.ceil(delta / LEVELS_PER_WEDGE);
    const byAngle = Math.ceil(((to - from) * 360) / MAX_WEDGE_DEGREES);
    const steps = Math.max(1, byColor, byAngle);
    for (let s = 0; s < steps; s++) {
      spans.push([
        from + ((to - from) * s) / steps,
        from + ((to - from) * (s + 1)) / steps,
      ]);
    }
  }
  // Too many: merge neighbours evenly until the fan fits
  let merged = spans;
  if (spans.length > MAX_WEDGES) {
    const factor = Math.ceil(spans.length / MAX_WEDGES);
    merged = [];
    for (let i = 0; i < spans.length; i += factor) {
      const group = spans.slice(i, i + factor);
      merged.push([
        (group[0] as [number, number])[0],
        (group.at(-1) as [number, number])[1],
      ]);
    }
  }

  // CSS angles start at 12 o'clock; SVG's +x axis is 3 o'clock.
  const start = angle - 90;
  // An extended wedge is up to 2 × 4° wide: reach a little further so its
  // chord stays outside the area
  const reach =
    radius / Math.cos(((2 * MAX_WEDGE_DEGREES) / 2) * (Math.PI / 180));
  const toPoint = (degrees: number): [string, string] => {
    const radians = (degrees * Math.PI) / 180;
    return [
      fmt(cx + reach * Math.cos(radians)),
      fmt(cy + reach * Math.sin(radians)),
    ];
  };
  const center = `${fmt(cx)} ${fmt(cy)}`;
  const normalize = (degrees: number) =>
    roundTo(((degrees % 360) + 360) % 360, 4);
  const last = merged.length - 1;

  const wedges = merged.map(([t0, t1], index) => {
    const color = colorAt(parsed, (t0 + t1) / 2);
    const width = (t1 - t0) * 360;
    // Shared alpha: reach under the neighbours (see above)
    const back = uniform && index === 0 && last > 0 ? width : 0;
    const ahead = uniform && index < last ? width : 0;
    const from = start + t0 * 360 - back;
    const to = start + t1 * 360 + ahead;
    const [x0, y0] = toPoint(from);
    const [x1, y1] = toPoint(to);
    return {
      d: `M${center}L${x0} ${y0}L${x1} ${y1}Z`,
      color: toHex6(color),
      ...(uniform || color.a >= 1 ? {} : { opacity: roundTo(color.a, 3) }),
      from: normalize(from),
      sweep: roundTo(to - from, 4),
    };
  });
  return uniform && firstAlpha < 1
    ? { wedges, opacity: roundTo(firstAlpha, 3) }
    : { wedges };
}

/** Angles (degrees, 0–360 from +x, clockwise) of a point around a centre. */
export function angleAround(
  cx: number,
  cy: number,
  x: number,
  y: number
): number {
  const degrees = (Math.atan2(y - cy, x - cx) * 180) / Math.PI;
  return ((degrees % 360) + 360) % 360;
}

/**
 * The arc of directions (degrees from +x, clockwise) a box covers seen from
 * (`cx`, `cy`), or null when the centre is inside the box (every direction).
 */
export function angularSpan(
  cx: number,
  cy: number,
  box: { x: number; y: number; width: number; height: number }
): [number, number] | null {
  const pad = 1e-6;
  if (
    cx >= box.x - pad &&
    cx <= box.x + box.width + pad &&
    cy >= box.y - pad &&
    cy <= box.y + box.height + pad
  ) {
    return null;
  }
  const corners = [
    [box.x, box.y],
    [box.x + box.width, box.y],
    [box.x, box.y + box.height],
    [box.x + box.width, box.y + box.height],
  ] as const;
  const middle = angleAround(
    cx,
    cy,
    box.x + box.width / 2,
    box.y + box.height / 2
  );
  let low = 0;
  let high = 0;
  for (const [x, y] of corners) {
    // Signed difference from the middle direction, in (-180, 180]
    let difference = angleAround(cx, cy, x, y) - middle;
    if (difference > 180) {
      difference -= 360;
    } else if (difference <= -180) {
      difference += 360;
    }
    low = Math.min(low, difference);
    high = Math.max(high, difference);
  }
  return [middle + low, middle + high];
}

/** True when the arcs [a0, a1] and [b0, b1] (degrees, a1 ≥ a0) meet. */
export function arcsOverlap(a: [number, number], b: [number, number]): boolean {
  const lengthA = a[1] - a[0];
  const lengthB = b[1] - b[0];
  if (lengthA >= 360 || lengthB >= 360) {
    return true;
  }
  // Start of b relative to the start of a, in [0, 360)
  const offset = (((b[0] - a[0]) % 360) + 360) % 360;
  return offset <= lengthA || offset + lengthB >= 360;
}
