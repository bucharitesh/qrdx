/** biome-ignore-all lint/style/noMagicNumbers: outline geometry */
// Outlines for shaped codes other than the circle: the built-in heart and
// silhouettes (QRSilhouette, a small grid traced from a picture). Each is a
// set of closed rings in artwork units (0 to 1 across, y down), placed so
// the largest square that fits inside is centered on the artwork: the
// symbol sits at the center like every other code, so the logo, art, eyes
// and gradients need nothing new. `half` is that square's half side, and
// the layout (qr-shape.ts) sizes the module grid so the symbol and its
// quiet ring fit in it.
import {
  QR_SILHOUETTE_MAX_CELLS,
  QR_SILHOUETTE_MIN_CELLS,
  QR_SILHOUETTE_MIN_SHARE,
} from "../types/constants";
import type { QRSilhouette } from "../types/qr";
import { fmt } from "./utils/fmt";

type Point = [number, number];

/** A line to its point, a quadratic (control, end) or a cubic (c1, c2, end). */
type Segment = Point[];

interface Ring {
  start: Point;
  segments: Segment[];
}

export interface Outline {
  /** Closed rings in artwork units (0 to 1), filled even-odd */
  rings: Ring[];
  /** The rings flattened into polygons, for inside tests */
  polygons: Point[][];
  /** Half side of the largest square centered on (0.5, 0.5) inside it */
  half: number;
}

const CURVE_STEPS = { 2: 6, 3: 12 } as const;

function flatten(ring: Ring): Point[] {
  const points: Point[] = [ring.start];
  let from = ring.start;
  for (const segment of ring.segments) {
    const end = segment.at(-1) as Point;
    if (segment.length === 1) {
      points.push(end);
    } else {
      const steps = CURVE_STEPS[segment.length as 2 | 3];
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const u = 1 - t;
        if (segment.length === 2) {
          const [c] = segment as [Point, Point];
          points.push([
            u * u * from[0] + 2 * u * t * c[0] + t * t * end[0],
            u * u * from[1] + 2 * u * t * c[1] + t * t * end[1],
          ]);
        } else {
          const [c1, c2] = segment as [Point, Point, Point];
          points.push([
            u * u * u * from[0] +
              3 * u * u * t * c1[0] +
              3 * u * t * t * c2[0] +
              t * t * t * end[0],
            u * u * u * from[1] +
              3 * u * u * t * c1[1] +
              3 * u * t * t * c2[1] +
              t * t * t * end[1],
          ]);
        }
      }
    }
    from = end;
  }
  return points;
}

/** Crossings of a horizontal line with the polygons, sorted (even-odd). */
function crossings(polygons: Point[][], y: number): number[] {
  const xs: number[] = [];
  for (const polygon of polygons) {
    for (let i = 0; i < polygon.length; i++) {
      const [x0, y0] = polygon[i] as Point;
      const [x1, y1] = polygon[(i + 1) % polygon.length] as Point;
      if (y0 <= y !== y1 <= y) {
        xs.push(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0));
      }
    }
  }
  return xs.sort((a, b) => a - b);
}

function insideRow(xs: number[], x: number): boolean {
  let count = 0;
  for (const crossing of xs) {
    if (crossing < x) count++;
    else break;
  }
  return count % 2 === 1;
}

/** True when (x, y) is inside the polygons (even-odd). */
export function insidePolygons(
  polygons: Point[][],
  x: number,
  y: number
): boolean {
  return insideRow(crossings(polygons, y), x);
}

/**
 * Inside tests at many points, caching each row's crossings (decoration
 * samples a few rows per module row).
 */
export function insideTester(polygons: Point[][]) {
  const rows = new Map<number, number[]>();
  return (x: number, y: number) => {
    let xs = rows.get(y);
    if (!xs) {
      xs = crossings(polygons, y);
      rows.set(y, xs);
    }
    return insideRow(xs, x);
  };
}

/** Distance from (cx, cy) to a segment, measured as max(|dx|, |dy|). */
function chebyshevToSegment(
  cx: number,
  cy: number,
  a: Point,
  b: Point
): number {
  const ax = a[0] - cx;
  const ay = a[1] - cy;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const at = (t: number) =>
    Math.max(Math.abs(ax + t * dx), Math.abs(ay + t * dy));
  let best = Math.min(at(0), at(1));
  // max(|x|, |y|) along the segment is smallest at an end or where |x| = |y|
  for (const [num, den] of [
    [ay - ax, dx - dy],
    [-(ax + ay), dx + dy],
  ] as const) {
    if (den !== 0) {
      const t = num / den;
      if (t > 0 && t < 1) best = Math.min(best, at(t));
    }
  }
  return best;
}

/** Half side of the largest square centered on (cx, cy) inside the polygons. */
function centeredHalf(polygons: Point[][], cx: number, cy: number): number {
  if (!insidePolygons(polygons, cx, cy)) return 0;
  let best = Number.POSITIVE_INFINITY;
  for (const polygon of polygons) {
    for (let i = 0; i < polygon.length; i++) {
      best = Math.min(
        best,
        chebyshevToSegment(
          cx,
          cy,
          polygon[i] as Point,
          polygon[(i + 1) % polygon.length] as Point
        )
      );
    }
  }
  return Number.isFinite(best) ? best : 0;
}

function bounds(polygons: Point[][]) {
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  for (const polygon of polygons) {
    for (const [x, y] of polygon) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  return { x0, y0, x1, y1 };
}

/**
 * Places rings (in any units) on the artwork: the center the symbol goes at
 * moves to (0.5, 0.5) and the rings scale to the largest size that keeps
 * them inside the artwork. The center is the one that gives the biggest
 * centered square after that scaling, found on a grid and then refined.
 */
function place(rings: Ring[]): Outline | null {
  const polygons = rings.map(flatten);
  const box = bounds(polygons);
  const width = box.x1 - box.x0;
  const height = box.y1 - box.y0;
  if (!(width > 0 && height > 0)) return null;
  const score = (cx: number, cy: number) => {
    const reach = Math.max(cx - box.x0, box.x1 - cx, cy - box.y0, box.y1 - cy);
    return reach > 0 ? centeredHalf(polygons, cx, cy) / (2 * reach) : 0;
  };
  let best = { cx: box.x0 + width / 2, cy: box.y0 + height / 2, value: 0 };
  best.value = score(best.cx, best.cy);
  const GRID = 32;
  for (let j = 1; j < GRID; j++) {
    for (let i = 1; i < GRID; i++) {
      const cx = box.x0 + (width * i) / GRID;
      const cy = box.y0 + (height * j) / GRID;
      const value = score(cx, cy);
      if (value > best.value) best = { cx, cy, value };
    }
  }
  let stepX = width / GRID;
  let stepY = height / GRID;
  for (let round = 0; round < 6; round++) {
    const center = best;
    for (let j = -2; j <= 2; j++) {
      for (let i = -2; i <= 2; i++) {
        const cx = center.cx + (stepX * i) / 2;
        const cy = center.cy + (stepY * j) / 2;
        const value = score(cx, cy);
        if (value > best.value) best = { cx, cy, value };
      }
    }
    stepX /= 2;
    stepY /= 2;
  }
  if (best.value <= 0) return null;
  const reach = Math.max(
    best.cx - box.x0,
    box.x1 - best.cx,
    best.cy - box.y0,
    box.y1 - best.cy
  );
  const k = 0.5 / reach;
  const map = ([x, y]: Point): Point => [
    0.5 + (x - best.cx) * k,
    0.5 + (y - best.cy) * k,
  ];
  const placed = rings.map((ring) => ({
    start: map(ring.start),
    segments: ring.segments.map((segment) => segment.map(map)),
  }));
  return { rings: placed, polygons: placed.map(flatten), half: best.value };
}

/** SVG path data for an outline drawn `size` px across. */
export function outlinePath(outline: Outline, size: number): string {
  const p = ([x, y]: Point) => `${fmt(x * size)} ${fmt(y * size)}`;
  let d = "";
  for (const ring of outline.rings) {
    d += `M${p(ring.start)}`;
    for (const segment of ring.segments) {
      const command =
        segment.length === 1 ? "L" : segment.length === 2 ? "Q" : "C";
      d += command + segment.map(p).join(" ");
    }
    d += "Z";
  }
  return d;
}

// ── The heart ──────────────────────────────────────────────────────────────

/**
 * A full heart in its own units (2 wide), clockwise from the notch: round
 * lobes, a shallow notch and full sides down to a soft point, so the symbol
 * takes 57% of the width (a slimmer heart left it 51%).
 */
const HEART: Ring = {
  start: [0, -0.58],
  segments: [
    [
      [0.2, -0.92],
      [1, -0.97],
      [1, -0.3],
    ],
    [
      [1, 0.3],
      [0.62, 0.6],
      [0, 0.92],
    ],
    [
      [-0.62, 0.6],
      [-1, 0.3],
      [-1, -0.3],
    ],
    [
      [-1, -0.97],
      [-0.2, -0.92],
      [0, -0.58],
    ],
  ],
};

let heartOutline: Outline | null | undefined;

/** The heart, placed on the artwork. */
export function getHeartOutline(): Outline {
  heartOutline ??= place([HEART]);
  return heartOutline as Outline;
}

// ── Silhouettes ────────────────────────────────────────────────────────────

/** Why a silhouette can't hold a code, or null when it can. */
export type SilhouetteProblem = "invalid" | "empty" | "thin";

function cellsOf(
  silhouette: QRSilhouette
): ((x: number, y: number) => boolean) | null {
  const { width, height, cells } = silhouette;
  if (
    !(
      Number.isInteger(width) &&
      Number.isInteger(height) &&
      width >= QR_SILHOUETTE_MIN_CELLS &&
      height >= QR_SILHOUETTE_MIN_CELLS &&
      width <= QR_SILHOUETTE_MAX_CELLS &&
      height <= QR_SILHOUETTE_MAX_CELLS &&
      typeof cells === "string" &&
      cells.length === width * height &&
      /^[01]*$/.test(cells)
    )
  ) {
    return null;
  }
  return (x, y) =>
    x >= 0 && y >= 0 && x < width && y < height && cells[y * width + x] === "1";
}

const key = ([x, y]: Point) => `${x},${y}`;

/**
 * The silhouette's outline as polygons through the midpoints between cell
 * centers (marching squares on the cell grid, cells joined only side to
 * side), with straight runs merged.
 */
function tracePolygons(
  on: (x: number, y: number) => boolean,
  width: number,
  height: number
): Point[][] {
  // Corner (i, j) is the center of cell (i - 1, j - 1); the frame is off.
  const corner = (i: number, j: number) => on(i - 1, j - 1);
  const links = new Map<string, Point[]>();
  const link = (a: Point, b: Point) => {
    for (const [from, to] of [
      [a, b],
      [b, a],
    ] as const) {
      const list = links.get(key(from)) ?? [];
      list.push(to);
      links.set(key(from), list);
    }
  };
  for (let j = 0; j <= height; j++) {
    for (let i = 0; i <= width; i++) {
      const tl = corner(i, j);
      const tr = corner(i + 1, j);
      const br = corner(i + 1, j + 1);
      const bl = corner(i, j + 1);
      // Edge midpoints, in cell units (cell centers sit at i - 0.5)
      const top: Point = [i, j - 0.5];
      const right: Point = [i + 0.5, j];
      const bottom: Point = [i, j + 0.5];
      const left: Point = [i - 0.5, j];
      const code = (tl ? 8 : 0) + (tr ? 4 : 0) + (br ? 2 : 0) + (bl ? 1 : 0);
      switch (code) {
        case 1:
        case 14:
          link(left, bottom);
          break;
        case 2:
        case 13:
          link(bottom, right);
          break;
        case 3:
        case 12:
          link(left, right);
          break;
        case 4:
        case 11:
          link(top, right);
          break;
        case 6:
        case 9:
          link(top, bottom);
          break;
        case 7:
        case 8:
          link(left, top);
          break;
        case 5:
          // Diagonal cells stay apart: cut off each lit corner
          link(top, right);
          link(left, bottom);
          break;
        case 10:
          link(left, top);
          link(bottom, right);
          break;
        default:
          break;
      }
    }
  }
  const polygons: Point[][] = [];
  const used = new Set<string>();
  for (const [startKey, ends] of links) {
    if (used.has(startKey) || ends.length === 0) continue;
    const [sx, sy] = startKey.split(",").map(Number) as Point;
    const ring: Point[] = [[sx, sy]];
    used.add(startKey);
    let previous: Point = [sx, sy];
    let current = ends[0] as Point;
    while (!used.has(key(current))) {
      used.add(key(current));
      ring.push(current);
      const next = nextOnRing(links.get(key(current)) ?? [], previous, used);
      if (!next) break;
      previous = current;
      current = next;
    }
    if (ring.length >= 3) polygons.push(mergeRuns(ring));
  }
  return polygons;
}

/** The neighbor to walk to: not where we came from, unvisited first. */
function nextOnRing(
  neighbors: Point[],
  previous: Point,
  used: Set<string>
): Point | undefined {
  const back = key(previous);
  return (
    neighbors.find((p) => key(p) !== back && !used.has(key(p))) ??
    neighbors.find((p) => key(p) !== back)
  );
}

/** Drops points in the middle of straight runs. */
function mergeRuns(ring: Point[]): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[(i - 1 + ring.length) % ring.length] as Point;
    const b = ring[i] as Point;
    const c = ring[(i + 1) % ring.length] as Point;
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cross) > 1e-9) out.push(b);
  }
  return out.length >= 3 ? out : ring;
}

/** A polygon drawn as a smooth curve: quadratics through its edge midpoints. */
function smoothRing(points: Point[]): Ring {
  const mid = (a: Point, b: Point): Point => [
    (a[0] + b[0]) / 2,
    (a[1] + b[1]) / 2,
  ];
  const n = points.length;
  const start = mid(points[n - 1] as Point, points[0] as Point);
  const segments: Segment[] = points.map((point, i) => [
    point,
    mid(point, points[(i + 1) % n] as Point),
  ]);
  return { start, segments };
}

const silhouetteCache = new Map<
  string,
  { outline: Outline | null; problem: SilhouetteProblem | null }
>();

/**
 * The silhouette's outline on the artwork, or why it can't hold a code:
 * "invalid" (not a well-formed grid), "empty" (no cells inside) or "thin"
 * (the symbol would take less than QR_SILHOUETTE_MIN_SHARE of the width).
 */
export function getSilhouetteOutline(silhouette: QRSilhouette): {
  outline: Outline | null;
  problem: SilhouetteProblem | null;
} {
  const cacheKey = `${silhouette.width}x${silhouette.height}:${silhouette.cells}`;
  const cached = silhouetteCache.get(cacheKey);
  if (cached) return cached;
  const on = cellsOf(silhouette);
  let result: { outline: Outline | null; problem: SilhouetteProblem | null };
  if (!on) {
    result = { outline: null, problem: "invalid" };
  } else if (silhouette.cells.includes("1")) {
    const polygons = tracePolygons(on, silhouette.width, silhouette.height);
    const outline =
      polygons.length > 0 ? place(polygons.map(smoothRing)) : null;
    result =
      outline && 2 * outline.half >= QR_SILHOUETTE_MIN_SHARE
        ? { outline, problem: null }
        : { outline: null, problem: outline ? "thin" : "empty" };
  } else {
    result = { outline: null, problem: "empty" };
  }
  if (silhouetteCache.size > 16) {
    silhouetteCache.delete(silhouetteCache.keys().next().value as string);
  }
  silhouetteCache.set(cacheKey, result);
  return result;
}
