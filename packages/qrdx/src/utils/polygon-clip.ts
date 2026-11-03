/** biome-ignore-all lint/style/noMagicNumbers: geometry */
// Flattening and box clipping for outlines, used where a shape has to be cut
// into pieces that every output draws the same way: the solid color steps of
// a gradient frame fill, and imported artwork that runs off its artboard.

import { fmt } from "./fmt";
import type { Segment } from "./svg-geometry";

export type Point = [number, number];

/**
 * Closed polygons of `segments` (one per subpath), with curves flattened to
 * at most `tolerance` units of chord error (roughly).
 */
export function flattenSegments(
  segments: Segment[],
  tolerance = 0.25
): Point[][] {
  const polygons: Point[][] = [];
  let current: Point[] = [];
  let start: Point = [0, 0];
  let last: Point = [0, 0];
  const flush = () => {
    if (current.length > 2) {
      polygons.push(current);
    }
    current = [];
  };
  for (const segment of segments) {
    if (segment.op === "M") {
      flush();
      start = [segment.x, segment.y];
      last = start;
      current.push(start);
    } else if (segment.op === "L") {
      last = [segment.x, segment.y];
      current.push(last);
    } else if (segment.op === "C") {
      const p0 = last;
      const p1: Point = [segment.x1, segment.y1];
      const p2: Point = [segment.x2, segment.y2];
      const p3: Point = [segment.x, segment.y];
      const hull =
        Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) +
        Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) +
        Math.hypot(p3[0] - p2[0], p3[1] - p2[1]);
      // A cubic's deviation from its chords falls with the square of the
      // step count.
      const steps = Math.max(
        2,
        Math.min(64, Math.ceil(Math.sqrt(hull / (4 * tolerance))))
      );
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const u = 1 - t;
        current.push([
          u * u * u * p0[0] +
            3 * u * u * t * p1[0] +
            3 * u * t * t * p2[0] +
            t * t * t * p3[0],
          u * u * u * p0[1] +
            3 * u * u * t * p1[1] +
            3 * u * t * t * p2[1] +
            t * t * t * p3[1],
        ]);
      }
      last = p3;
    } else {
      flush();
      last = start;
    }
  }
  flush();
  return polygons;
}

export interface ClipBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

type Edge = (point: Point) => number;

/**
 * Sutherland–Hodgman clip of one closed polygon to an axis-aligned box. The
 * result keeps the polygon's winding inside the box, so a shape made of
 * several subpaths fills the same way (nonzero or even-odd) once each
 * subpath is clipped.
 */
export function clipPolygon(points: Point[], box: ClipBox): Point[] {
  // Signed distance inside each edge (>= 0 is kept)
  const edges: Edge[] = [
    (p) => p[0] - box.x0,
    (p) => box.x1 - p[0],
    (p) => p[1] - box.y0,
    (p) => box.y1 - p[1],
  ];
  let output = points;
  for (const inside of edges) {
    if (output.length === 0) {
      break;
    }
    const input = output;
    output = [];
    for (let i = 0; i < input.length; i++) {
      const current = input[i] as Point;
      const previous = input[(i + input.length - 1) % input.length] as Point;
      const dc = inside(current);
      const dp = inside(previous);
      if (dc >= 0) {
        if (dp < 0) {
          output.push(intersect(previous, current, dp, dc));
        }
        output.push(current);
      } else if (dp >= 0) {
        output.push(intersect(previous, current, dp, dc));
      }
    }
  }
  return output.length > 2 ? output : [];
}

function intersect(a: Point, b: Point, da: number, db: number): Point {
  const t = da / (da - db);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Closed polygons as path data (absolute, 3 decimals). */
export function polygonsToPath(polygons: Point[][]): string {
  return polygons
    .filter((polygon) => polygon.length > 2)
    .map(
      (polygon) =>
        `M${polygon.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join("L")}Z`
    )
    .join("");
}

/** Bounding box of segments (control points included), or null if empty. */
export function segmentsBounds(segments: Segment[]): ClipBox | null {
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  const add = (x: number, y: number) => {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  };
  for (const segment of segments) {
    if (segment.op === "C") {
      add(segment.x1, segment.y1);
      add(segment.x2, segment.y2);
      add(segment.x, segment.y);
    } else if (segment.op !== "Z") {
      add(segment.x, segment.y);
    }
  }
  return Number.isFinite(x0) ? { x0, y0, x1, y1 } : null;
}
