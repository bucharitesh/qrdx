/** biome-ignore-all lint/style/noMagicNumbers: rasterizer and shading math */
// Test-only renderers for gradient exports, written from the specs rather
// than from the exporters' code:
// - `renderSvgReference` paints the SVG with real gradients (SVG 1.1/2
//   linear and radial gradients: gradientUnits, gradientTransform, href
//   inheritance, focal point, pad spread), solid fills as `rasterizeSvg`
//   does. Strokes, text and images are not painted.
// - `rasterizePdf` / `rasterizeEps` interpret the exported operators (paths,
//   fills, q/Q gsave/grestore, cm/concat, W n / clip eoclip, sh / shfill)
//   and evaluate ShadingType 2/3 dictionaries with Type 2 and Type 3
//   functions per ISO 32000-1 §8.7.4.5 and the PLRM (LanguageLevel 3).

import { inflateSync } from "node:zlib";
import { parseColor } from "../../src/utils/parse-color";
import {
  applyMatrix,
  type Matrix,
  multiply,
  parseSvgMarkup,
  parseTransform,
  type Segment,
  type SvgNode,
} from "../../src/utils/svg-geometry";
import {
  collectGradientColors,
  length,
  type PaintState,
  SvgPainter,
} from "../../src/utils/svg-painter";
import { createImage, fillPolygons, type RasterImage } from "./raster";

type Point = [number, number];
type RGB = [number, number, number];

// ── Shared geometry ────────────────────────────────────────────────────────

function invert(m: Matrix): Matrix {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  return [
    d / det,
    -b / det,
    -c / det,
    a / det,
    (c * f - d * e) / det,
    (b * e - a * f) / det,
  ];
}

function bezier(p0: Point, p1: Point, p2: Point, p3: Point, steps = 16) {
  const out: Point[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push([
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
  return out;
}

function flatten(segments: Segment[], matrix: Matrix): Point[][] {
  const polygons: Point[][] = [];
  let current: Point[] = [];
  let start: Point = [0, 0];
  let last: Point = [0, 0];
  for (const s of segments) {
    if (s.op === "M") {
      if (current.length > 1) polygons.push(current);
      start = applyMatrix(matrix, s.x, s.y);
      last = start;
      current = [start];
    } else if (s.op === "L") {
      last = applyMatrix(matrix, s.x, s.y);
      current.push(last);
    } else if (s.op === "C") {
      const p3 = applyMatrix(matrix, s.x, s.y);
      current.push(
        ...bezier(
          last,
          applyMatrix(matrix, s.x1, s.y1),
          applyMatrix(matrix, s.x2, s.y2),
          p3
        )
      );
      last = p3;
    } else {
      if (current.length > 1) polygons.push(current);
      current = [start];
      last = start;
    }
  }
  if (current.length > 1) polygons.push(current);
  return polygons;
}

/** Coverage (0–1) of polygons, in a window around their bounding box. */
interface Mask {
  x0: number;
  y0: number;
  width: number;
  height: number;
  data: Float32Array;
}

function coverage(
  polygons: Point[][],
  evenOdd: boolean,
  bounds: { width: number; height: number }
): Mask | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const polygon of polygons) {
    for (const [x, y] of polygon) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  const x0 = Math.max(0, Math.floor(minX));
  const y0 = Math.max(0, Math.floor(minY));
  const x1 = Math.min(bounds.width, Math.ceil(maxX));
  const y1 = Math.min(bounds.height, Math.ceil(maxY));
  if (!(x1 > x0 && y1 > y0)) return null;
  // Fill white onto a transparent window: its alpha is the coverage.
  const window = createImage(x1 - x0, y1 - y0, null);
  fillPolygons(
    window,
    polygons.map((polygon) => polygon.map(([x, y]): Point => [x - x0, y - y0])),
    { r: 255, g: 255, b: 255, a: 1 },
    1,
    evenOdd
  );
  const data = new Float32Array(window.width * window.height);
  for (let i = 0; i < data.length; i++) {
    data[i] = (window.data[i * 4 + 3] as number) / 255;
  }
  return { x0, y0, width: window.width, height: window.height, data };
}

const maskAt = (mask: Mask | null, x: number, y: number) => {
  if (!mask) return 1;
  const lx = x - mask.x0;
  const ly = y - mask.y0;
  if (lx < 0 || ly < 0 || lx >= mask.width || ly >= mask.height) return 0;
  return mask.data[ly * mask.width + lx] as number;
};

/** Paints `area` (× `clip`) with a per-pixel color; null colors skip. */
function composite(
  image: RasterImage,
  area: Mask,
  clip: Mask | null,
  colorAt: (x: number, y: number) => RGB | null
) {
  for (let ly = 0; ly < area.height; ly++) {
    for (let lx = 0; lx < area.width; lx++) {
      const x = area.x0 + lx;
      const y = area.y0 + ly;
      const alpha =
        (area.data[ly * area.width + lx] as number) * maskAt(clip, x, y);
      if (alpha <= 0) continue;
      const color = colorAt(x + 0.5, y + 0.5);
      if (!color) continue;
      const i = (y * image.width + x) * 4;
      for (let k = 0; k < 3; k++) {
        image.data[i + k] =
          (color[k] as number) * alpha +
          (image.data[i + k] as number) * (1 - alpha);
      }
      image.data[i + 3] = 255;
    }
  }
}

function intersect(clip: Mask | null, area: Mask): Mask {
  const data = new Float32Array(area.data.length);
  for (let ly = 0; ly < area.height; ly++) {
    for (let lx = 0; lx < area.width; lx++) {
      const i = ly * area.width + lx;
      data[i] =
        (area.data[i] as number) * maskAt(clip, area.x0 + lx, area.y0 + ly);
    }
  }
  return { ...area, data };
}

// ── Two-circle gradient parameter (canvas / SVG 2 / PDF Type 3) ───────────

/**
 * Largest s with the point on circle (c0 + s(c1 − c0), r0 + s(r1 − r0)),
 * r(s) ≥ 0, s in [0, 1] unless an extend flag lets it run past that end.
 * Returns s clamped to [0, 1], or null when no circle covers the point.
 */
function twoCircle(
  [x0, y0, r0, x1, y1, r1]: number[],
  [px, py]: Point,
  extend: [boolean, boolean]
): number | null {
  const cdx = (x1 as number) - (x0 as number);
  const cdy = (y1 as number) - (y0 as number);
  const dr = (r1 as number) - (r0 as number);
  const pdx = px - (x0 as number);
  const pdy = py - (y0 as number);
  const a = cdx * cdx + cdy * cdy - dr * dr;
  const b = pdx * cdx + pdy * cdy + (r0 as number) * dr;
  const c = pdx * pdx + pdy * pdy - (r0 as number) * (r0 as number);
  let roots: number[];
  if (Math.abs(a) < 1e-9) {
    roots = Math.abs(b) < 1e-12 ? [] : [c / (2 * b)];
  } else {
    const disc = b * b - a * c;
    if (disc < 0) return null;
    const sq = Math.sqrt(disc);
    roots = [(b + sq) / a, (b - sq) / a].sort((p, q) => q - p);
  }
  for (const s of roots) {
    if ((r0 as number) + s * dr < 0) continue;
    if (s > 1 && !extend[1]) continue;
    if (s < 0 && !extend[0]) continue;
    return Math.min(1, Math.max(0, s));
  }
  return null;
}

// ── SVG reference renderer ─────────────────────────────────────────────────

interface SvgGradientDef {
  kind: "linear" | "radial";
  attrs: Record<string, string>;
  stops: { offset: number; color: RGB }[];
}

function svgGradients(root: SvgNode): Map<string, SvgGradientDef> {
  const byId = new Map<string, SvgNode>();
  const visit = (node: SvgNode) => {
    if (
      (node.name === "linearGradient" || node.name === "radialGradient") &&
      node.attrs.id &&
      !byId.has(node.attrs.id)
    ) {
      byId.set(node.attrs.id, node);
    }
    node.children.forEach(visit);
  };
  visit(root);
  const shared = ["gradientUnits", "gradientTransform"];
  const own = {
    linearGradient: ["x1", "y1", "x2", "y2"],
    radialGradient: ["cx", "cy", "r", "fx", "fy", "fr"],
  };
  const out = new Map<string, SvgGradientDef>();
  for (const [id, node] of byId) {
    const attrs: Record<string, string> = {};
    let stopNodes: SvgNode[] = [];
    let current: SvgNode | undefined = node;
    for (let depth = 0; current && depth < 10; depth++) {
      const names =
        current.name === node.name
          ? [...shared, ...own[node.name as keyof typeof own]]
          : shared;
      for (const name of names) {
        if (attrs[name] === undefined && current.attrs[name] !== undefined) {
          attrs[name] = current.attrs[name];
        }
      }
      if (stopNodes.length === 0) {
        stopNodes = current.children.filter((child) => child.name === "stop");
      }
      const href: string | undefined =
        current.attrs.href ?? current.attrs["xlink:href"];
      current = href ? byId.get(href.slice(1)) : undefined;
    }
    let previous = 0;
    const stops = stopNodes.map((stop) => {
      const raw = stop.attrs.offset ?? "0";
      const value = raw.endsWith("%")
        ? Number.parseFloat(raw) / 100
        : Number.parseFloat(raw);
      previous = Math.max(previous, Math.min(1, Math.max(0, value || 0)));
      const color = parseColor(stop.attrs["stop-color"] ?? "#000") ?? {
        r: 0,
        g: 0,
        b: 0,
        a: 1,
      };
      return { offset: previous, color: [color.r, color.g, color.b] as RGB };
    });
    out.set(id, {
      kind: node.name === "linearGradient" ? "linear" : "radial",
      attrs,
      stops,
    });
  }
  return out;
}

/** SVG stop interpolation at t, padded beyond the first and last stops. */
function stopColor(stops: SvgGradientDef["stops"], t: number): RGB {
  const first = stops[0] as SvgGradientDef["stops"][number];
  const last = stops.at(-1) as SvgGradientDef["stops"][number];
  if (t <= first.offset) return first.color;
  if (t >= last.offset) return last.color;
  for (let i = 0; i + 1 < stops.length; i++) {
    const a = stops[i] as SvgGradientDef["stops"][number];
    const b = stops[i + 1] as SvgGradientDef["stops"][number];
    if (t >= a.offset && t < b.offset) {
      const u = (t - a.offset) / (b.offset - a.offset);
      return a.color.map((v, k) => v + u * ((b.color[k] as number) - v)) as RGB;
    }
  }
  return last.color;
}

/**
 * Color of an SVG gradient at a point of the referencing element's user
 * space. `box` is the element's bounding box (objectBoundingBox units).
 */
export function svgGradientColorAt(
  gradient: SvgGradientDef,
  point: Point,
  viewport: [number, number],
  box: { x: number; y: number; width: number; height: number }
): RGB {
  const { attrs, stops } = gradient;
  const userSpace = attrs.gradientUnits === "userSpaceOnUse";
  const toUser = multiply(
    userSpace
      ? [1, 0, 0, 1, 0, 0]
      : [box.width, 0, 0, box.height, box.x, box.y],
    parseTransform(attrs.gradientTransform)
  );
  const p = applyMatrix(invert(toUser), point[0], point[1]);
  const [vw, vh] = viewport;
  const len = (name: string, fallback: string, reference: number) => {
    const raw = attrs[name] ?? fallback;
    const n = Number.parseFloat(raw);
    if (!raw.endsWith("%")) return n;
    return (n / 100) * (userSpace ? reference : 1);
  };
  if (gradient.kind === "linear") {
    const x1 = len("x1", "0%", vw);
    const y1 = len("y1", "0%", vh);
    const x2 = len("x2", "100%", vw);
    const y2 = len("y2", "0%", vh);
    const dx = x2 - x1;
    const dy = y2 - y1;
    return stopColor(
      stops,
      ((p[0] - x1) * dx + (p[1] - y1) * dy) / (dx * dx + dy * dy)
    );
  }
  const diagonal = Math.sqrt((vw * vw + vh * vh) / 2);
  const cx = len("cx", "50%", vw);
  const cy = len("cy", "50%", vh);
  const r = len("r", "50%", diagonal);
  const fx = attrs.fx === undefined ? cx : len("fx", "50%", vw);
  const fy = attrs.fy === undefined ? cy : len("fy", "50%", vh);
  const fr = len("fr", "0%", diagonal);
  const t = twoCircle([fx, fy, fr, cx, cy, r], p, [true, true]);
  return stopColor(stops, t ?? 1);
}

function userBox(segments: Segment[]) {
  const points = flatten(segments, [1, 0, 0, 1, 0, 0]).flat();
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

class ReferencePainter extends SvgPainter {
  private readonly target: RasterImage;
  private readonly defs: Map<string, SvgGradientDef>;

  constructor(image: RasterImage, root: SvgNode) {
    super(collectGradientColors(root, new Map()));
    this.target = image;
    this.defs = svgGradients(root);
  }

  paint(segments: Segment[], _node: SvgNode, state: PaintState) {
    const area = coverage(
      flatten(segments, state.matrix),
      state.fillRule === "evenodd",
      this.target
    );
    if (!area) return;
    const id = /^url\(\s*#([^)\s]+)\s*\)/.exec(state.fill)?.[1];
    const gradient = id ? this.defs.get(id) : undefined;
    if (gradient) {
      const toUser = invert(state.matrix);
      const box = userBox(segments);
      composite(this.target, area, null, (x, y) =>
        svgGradientColorAt(
          gradient,
          applyMatrix(toUser, x, y),
          state.viewport,
          box
        )
      );
      return;
    }
    const color = this.resolveColor(state.fill);
    if (color) {
      composite(this.target, area, null, () => [color.r, color.g, color.b]);
    }
  }

  text() {
    // Not needed for codes without frames.
  }

  image() {
    // Not needed: the cases have no logos.
  }
}

/** Renders SVG markup `width` px wide with real gradients on white. */
export function renderSvgReference(svg: string, width: number): RasterImage {
  const root = parseSvgMarkup(svg);
  if (!root) throw new Error("Not an SVG document");
  const rootWidth = length(root.attrs.width, 0, 0);
  const rootHeight = length(root.attrs.height, 0, 0) || rootWidth;
  const scale = width / rootWidth;
  const image = createImage(width, rootHeight * scale);
  new ReferencePainter(image, root).walk(
    root,
    {
      matrix: [scale, 0, 0, scale, 0, 0],
      viewport: [rootWidth, rootHeight],
      fill: "#000000",
      fillRule: "nonzero",
      stroke: "none",
      strokeWidth: 1,
      fontSize: 16,
      fontWeight: "normal",
      textAnchor: "start",
    },
    true
  );
  return image;
}

/** Gradient definitions of an SVG, for computing expected colors. */
export function referenceGradients(svg: string): Map<string, SvgGradientDef> {
  const root = parseSvgMarkup(svg);
  if (!root) throw new Error("Not an SVG document");
  return svgGradients(root);
}

// ── PostScript / PDF object syntax ─────────────────────────────────────────

class Name {
  readonly value: string;
  constructor(value: string) {
    this.value = value;
  }
}

const MARK = Symbol("mark");
export type PsDict = Map<string, PsValue>;
export type PsValue =
  | number
  | boolean
  | string
  | Name
  | PsValue[]
  | PsDict
  | null;

/** Splits PostScript/PDF source into tokens; strings and procedures fold. */
function tokenize(source: string): string[] {
  const tokens: string[] = [];
  const re =
    /<<|>>|\[|\]|\{|\}|\((?:\\.|[^\\)])*\)|\/[^\s/[\]()<>{}%]*|[^\s/[\]()<>{}%]+|%[^\n]*/g;
  for (const match of source.matchAll(re)) {
    const token = match[0];
    if (!token.startsWith("%")) tokens.push(token);
  }
  return tokens;
}

/** Collects stack items above the last mark. */
function popToMark(stack: (PsValue | typeof MARK)[]): PsValue[] {
  const items: PsValue[] = [];
  while (stack.length > 0) {
    const item = stack.pop();
    if (item === MARK) return items.reverse();
    items.push(item as PsValue);
  }
  return items.reverse();
}

const asNumber = (value: PsValue | undefined, fallback = 0) =>
  typeof value === "number" ? value : fallback;
const asArray = (value: PsValue | undefined) =>
  Array.isArray(value) ? value : [];
const nameOf = (value: PsValue | undefined) =>
  value instanceof Name ? value.value : "";

/** Evaluates a PDF Type 2 / Type 3 function at t. */
function evalFunction(fn: PsValue | undefined, t: number): number[] {
  if (!(fn instanceof Map)) throw new Error("Function is not a dictionary");
  const type = asNumber(fn.get("FunctionType"), -1);
  const domain = asArray(fn.get("Domain")).map((v) => asNumber(v));
  const d0 = domain[0] ?? 0;
  const d1 = domain[1] ?? 1;
  const x = Math.min(Math.max(t, d0), d1);
  if (type === 2) {
    const c0 = asArray(fn.get("C0") ?? [0]).map((v) => asNumber(v));
    const c1 = asArray(fn.get("C1") ?? [1]).map((v) => asNumber(v));
    const n = asNumber(fn.get("N"), 1);
    return c0.map((v, i) => v + x ** n * ((c1[i] as number) - v));
  }
  if (type === 3) {
    const functions = asArray(fn.get("Functions"));
    const bounds = asArray(fn.get("Bounds")).map((v) => asNumber(v));
    const encode = asArray(fn.get("Encode")).map((v) => asNumber(v));
    let i = bounds.findIndex((b) => x < b);
    if (i < 0) i = functions.length - 1;
    const lo = i === 0 ? d0 : (bounds[i - 1] as number);
    const hi = i === functions.length - 1 ? d1 : (bounds[i] as number);
    const e0 = encode[2 * i] as number;
    const e1 = encode[2 * i + 1] as number;
    const u = hi === lo ? e0 : e0 + ((x - lo) * (e1 - e0)) / (hi - lo);
    return evalFunction(functions[i], u);
  }
  throw new Error(`Unsupported FunctionType ${type}`);
}

const cmykToRgb = ([c, m, y, k]: number[]): RGB => [
  255 * (1 - (c as number)) * (1 - (k as number)),
  255 * (1 - (m as number)) * (1 - (k as number)),
  255 * (1 - (y as number)) * (1 - (k as number)),
];

/** Color of a ShadingType 2/3 dictionary at a point of shading space. */
export function shadingColorAt(shading: PsDict, point: Point): RGB | null {
  const type = asNumber(shading.get("ShadingType"));
  const coords = asArray(shading.get("Coords")).map((v) => asNumber(v));
  const domain = asArray(shading.get("Domain") ?? [0, 1]).map((v) =>
    asNumber(v)
  );
  const extendFlags = asArray(shading.get("Extend") ?? [false, false]);
  const extend: [boolean, boolean] = [
    extendFlags[0] === true,
    extendFlags[1] === true,
  ];
  let s: number | null;
  if (type === 2) {
    const [x0, y0, x1, y1] = coords as [number, number, number, number];
    const dx = x1 - x0;
    const dy = y1 - y0;
    s = ((point[0] - x0) * dx + (point[1] - y0) * dy) / (dx * dx + dy * dy);
    if ((s < 0 && !extend[0]) || (s > 1 && !extend[1])) return null;
    s = Math.min(1, Math.max(0, s));
  } else if (type === 3) {
    s = twoCircle(coords, point, extend);
    if (s === null) return null;
  } else {
    throw new Error(`Unsupported ShadingType ${type}`);
  }
  const t0 = domain[0] ?? 0;
  const t1 = domain[1] ?? 1;
  const color = evalFunction(shading.get("Function"), t0 + s * (t1 - t0));
  const space = nameOf(shading.get("ColorSpace"));
  if (space === "DeviceCMYK") return cmykToRgb(color);
  if (space === "DeviceRGB") return color.map((v) => v * 255) as RGB;
  throw new Error(`Unsupported ColorSpace ${space}`);
}

// ── Operator interpreter ───────────────────────────────────────────────────

export interface Rendered {
  image: RasterImage;
  /** Shading dictionaries painted, in order (one entry per sh / shfill) */
  shadings: PsDict[];
  /** Fill colors of solid fills, in order */
  fills: RGB[];
}

interface InterpretOptions {
  page: { width: number; height: number };
  scale: number;
  /** Named shadings (PDF page resources) */
  resources?: PsDict;
  resolve?: (objectNumber: number) => PsValue;
}

function interpret(source: string, options: InterpretOptions): Rendered {
  const { page, scale } = options;
  const image = createImage(page.width * scale, page.height * scale);
  const rendered: Rendered = { image, shadings: [], fills: [] };
  const stack: (PsValue | typeof MARK)[] = [];
  const userDict = new Map<string, PsValue>();
  interface State {
    ctm: Matrix;
    color: RGB;
    clip: Mask | null;
  }
  let gs: State = {
    ctm: [scale, 0, 0, -scale, 0, page.height * scale],
    color: [0, 0, 0],
    clip: null,
  };
  const saved: State[] = [];
  let polygons: Point[][] = [];
  let current: Point[] = [];
  let start: Point = [0, 0];
  let last: Point = [0, 0];
  let pendingClip: boolean | null = null;

  const nums = (count: number) => {
    const out: number[] = [];
    for (let i = 0; i < count; i++)
      out.unshift(asNumber(stack.pop() as PsValue));
    return out;
  };
  const closeSubpath = () => {
    if (current.length > 1) polygons.push(current);
    current = [];
  };
  const endPath = () => {
    closeSubpath();
    polygons = [];
  };
  const fill = (evenOdd: boolean) => {
    closeSubpath();
    const area = coverage(polygons, evenOdd, image);
    if (area) {
      const color = gs.color;
      rendered.fills.push(color);
      composite(image, area, gs.clip, () => color);
    }
  };
  const clipTo = (evenOdd: boolean) => {
    closeSubpath();
    const area = coverage(polygons, evenOdd, image);
    gs = {
      ...gs,
      clip: area
        ? intersect(gs.clip, area)
        : { x0: 0, y0: 0, width: 0, height: 0, data: new Float32Array() },
    };
  };
  const shade = (shading: PsValue | undefined) => {
    if (!(shading instanceof Map)) throw new Error("Shading not found");
    rendered.shadings.push(shading);
    const clip = gs.clip;
    if (!clip) throw new Error("Unclipped shading");
    const toShading = invert(gs.ctm);
    composite(image, clip, null, (x, y) =>
      shadingColorAt(shading, applyMatrix(toShading, x, y))
    );
  };
  const finishPath = (paint: () => void) => {
    paint();
    if (pendingClip !== null) clipTo(pendingClip);
    pendingClip = null;
    endPath();
  };

  for (const token of tokenize(source)) {
    if (/^[-+]?(\d+\.?\d*|\.\d+)$/.test(token)) {
      stack.push(Number(token));
      continue;
    }
    if (token.startsWith("/")) {
      stack.push(new Name(token.slice(1)));
      continue;
    }
    if (token.startsWith("(") || token === "{" || token === "}") {
      stack.push(null);
      continue;
    }
    switch (token) {
      case "<<":
      case "[":
        stack.push(MARK);
        break;
      case ">>": {
        const items = popToMark(stack);
        const dict: PsDict = new Map();
        for (let i = 0; i + 1 < items.length; i += 2) {
          dict.set(nameOf(items[i]), items[i + 1] as PsValue);
        }
        stack.push(dict);
        break;
      }
      case "]":
        stack.push(popToMark(stack));
        break;
      case "true":
      case "false":
        stack.push(token === "true");
        break;
      case "R": {
        const [objectNumber] = nums(2);
        stack.push(options.resolve?.(objectNumber as number) ?? null);
        break;
      }
      case "def": {
        const value = stack.pop() as PsValue;
        userDict.set(nameOf(stack.pop() as PsValue), value);
        break;
      }
      case "q":
      case "gsave":
        saved.push(gs);
        break;
      case "Q":
      case "grestore":
        gs = saved.pop() ?? gs;
        break;
      case "cm":
        gs = { ...gs, ctm: multiply(gs.ctm, nums(6) as Matrix) };
        break;
      case "concat":
        gs = {
          ...gs,
          ctm: multiply(
            gs.ctm,
            asArray(stack.pop() as PsValue).map((v) => asNumber(v)) as Matrix
          ),
        };
        break;
      case "rg":
        gs = { ...gs, color: nums(3).map((v) => v * 255) as RGB };
        break;
      case "g": {
        const [grey] = nums(1);
        gs = {
          ...gs,
          color: [0, 0, 0].map(() => (grey as number) * 255) as RGB,
        };
        break;
      }
      case "k":
      case "cmyk":
        gs = { ...gs, color: cmykToRgb(nums(4)) };
        break;
      case "m": {
        const [x, y] = nums(2);
        closeSubpath();
        start = applyMatrix(gs.ctm, x as number, y as number);
        last = start;
        current = [start];
        break;
      }
      case "l": {
        const [x, y] = nums(2);
        last = applyMatrix(gs.ctm, x as number, y as number);
        current.push(last);
        break;
      }
      case "c": {
        const [a, b, c, d, e, f] = nums(6) as number[];
        const p3 = applyMatrix(gs.ctm, e as number, f as number);
        current.push(
          ...bezier(
            last,
            applyMatrix(gs.ctm, a as number, b as number),
            applyMatrix(gs.ctm, c as number, d as number),
            p3
          )
        );
        last = p3;
        break;
      }
      case "re": {
        const [x, y, w, h] = nums(4) as number[];
        closeSubpath();
        const corner = (px: number, py: number) => applyMatrix(gs.ctm, px, py);
        polygons.push([
          corner(x as number, y as number),
          corner((x as number) + (w as number), y as number),
          corner((x as number) + (w as number), (y as number) + (h as number)),
          corner(x as number, (y as number) + (h as number)),
        ]);
        break;
      }
      case "h":
        closeSubpath();
        current = [start];
        last = start;
        break;
      case "f":
      case "F":
      case "B":
      case "b":
        finishPath(() => fill(false));
        break;
      case "f*":
      case "ef":
      case "B*":
      case "b*":
        finishPath(() => fill(true));
        break;
      case "n":
      case "S":
      case "s":
        finishPath(() => undefined);
        break;
      case "W":
      case "W*":
        pendingClip = token === "W*";
        break;
      case "clip":
      case "eoclip":
        clipTo(token === "eoclip");
        // PostScript keeps the path after clip; "n" follows.
        current = [];
        break;
      case "sh":
        shade(options.resources?.get(nameOf(stack.pop() as PsValue)));
        break;
      case "shfill":
        shade(stack.pop() as PsValue);
        break;
      default:
        if (userDict.has(token)) {
          stack.push(userDict.get(token) as PsValue);
        } else {
          // Text, line widths and other operators: drop their operands.
          stack.length = 0;
        }
    }
  }
  return rendered;
}

/** Parses one PostScript/PDF literal (dictionary, array, number…). */
function parseLiteral(
  source: string,
  resolve?: (objectNumber: number) => PsValue
): PsValue {
  const stack: (PsValue | typeof MARK)[] = [];
  for (const token of tokenize(source)) {
    if (/^[-+]?(\d+\.?\d*|\.\d+)$/.test(token)) stack.push(Number(token));
    else if (token.startsWith("/")) stack.push(new Name(token.slice(1)));
    else if (token === "<<" || token === "[") stack.push(MARK);
    else if (token === ">>") {
      const items = popToMark(stack);
      const dict: PsDict = new Map();
      for (let i = 0; i + 1 < items.length; i += 2) {
        dict.set(nameOf(items[i]), items[i + 1] as PsValue);
      }
      stack.push(dict);
    } else if (token === "]") stack.push(popToMark(stack));
    else if (token === "true" || token === "false")
      stack.push(token === "true");
    else if (token === "R") {
      stack.pop();
      const objectNumber = asNumber(stack.pop() as PsValue);
      stack.push(resolve?.(objectNumber) ?? null);
    } else if (token === "obj" || token === "endobj") {
      // Object wrapper keywords
    } else stack.push(null);
  }
  return (stack.find((item) => item instanceof Map) as PsValue) ?? null;
}

/** Extracts the balanced `<< … >>` starting at `index`. */
function dictionaryAt(text: string, index: number): string {
  let depth = 0;
  for (let i = index; i < text.length - 1; i++) {
    const pair = text.slice(i, i + 2);
    if (pair === "<<") {
      depth++;
      i++;
    } else if (pair === ">>") {
      depth--;
      i++;
      if (depth === 0) return text.slice(index, i + 1);
    }
  }
  throw new Error("Unbalanced dictionary");
}

export interface PdfDocument {
  text: string;
  /** Decompressed page content */
  content: string;
  /** The page's /Shading resources by name */
  shadings: PsDict;
  mediaBox: [number, number];
}

export function readPdf(buffer: ArrayBuffer): PdfDocument {
  const bytes = Buffer.from(new Uint8Array(buffer));
  const text = bytes.toString("latin1");
  const box = /\/MediaBox \[([-\d. ]+)\]/.exec(text)?.[1]?.trim().split(/\s+/);
  const content: string[] = [];
  const marker = /(?<!end)stream\r?\n/g;
  let match = marker.exec(text);
  while (match) {
    const start = match.index + match[0].length;
    const end = text.indexOf("endstream", start);
    if (end < 0) break;
    try {
      content.push(inflateSync(bytes.subarray(start, end)).toString("latin1"));
    } catch {
      // Not a Flate stream
    }
    marker.lastIndex = end;
    match = marker.exec(text);
  }
  const resolve = (objectNumber: number): PsValue => {
    const at = new RegExp(`(^|\\n)${objectNumber} 0 obj\\s*`).exec(text);
    if (!at) return null;
    const start = at.index + at[0].length;
    return parseLiteral(dictionaryAt(text, text.indexOf("<<", start)), resolve);
  };
  const shadingAt = text.indexOf("/Shading <<");
  const shadings =
    shadingAt < 0
      ? new Map()
      : (parseLiteral(
          dictionaryAt(text, shadingAt + "/Shading ".length),
          resolve
        ) as PsDict);
  return {
    text,
    content: content.join("\n"),
    shadings,
    mediaBox: [Number(box?.[2]), Number(box?.[3])],
  };
}

/** Rasterizes a PDF's page content, `scale` px per point. */
export function rasterizePdf(buffer: ArrayBuffer, scale: number): Rendered {
  const pdf = readPdf(buffer);
  return interpret(pdf.content, {
    page: { width: pdf.mediaBox[0], height: pdf.mediaBox[1] },
    scale,
    resources: pdf.shadings,
  });
}

/** Rasterizes an EPS (script after the prolog), `scale` px per point. */
export function rasterizeEps(eps: string, scale: number): Rendered {
  const box = /%%HiResBoundingBox: 0 0 ([\d.]+) ([\d.]+)/.exec(eps);
  return interpret(eps.slice(eps.indexOf("%%EndProlog")), {
    page: { width: Number(box?.[1]), height: Number(box?.[2]) },
    scale,
  });
}

/** Shading dictionaries an EPS defines (`/ShN << … >> def`), by name. */
export function epsShadings(eps: string): PsDict {
  const out: PsDict = new Map();
  for (const match of eps.matchAll(/^\/(\S+) (<<.*>>) def$/gm)) {
    out.set(match[1] as string, parseLiteral(match[2] as string));
  }
  return out;
}

/** The pixel's RGB. */
export function pixel(image: RasterImage, x: number, y: number): RGB {
  const i = (Math.floor(y) * image.width + Math.floor(x)) * 4;
  return [
    image.data[i] as number,
    image.data[i + 1] as number,
    image.data[i + 2] as number,
  ];
}

/** Largest per-channel difference. */
export const channelDistance = (a: RGB, b: RGB) =>
  Math.max(...a.map((v, i) => Math.abs(v - (b[i] as number))));

export type { RGB };
