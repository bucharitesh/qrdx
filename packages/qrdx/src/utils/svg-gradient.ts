/** biome-ignore-all lint/style/noMagicNumbers: SVG gradient geometry */
// SVG <linearGradient> / <radialGradient> for the vector exporters. Both PDF
// (ShadingType 2/3 painted with `sh`) and PostScript LanguageLevel 3 (`shfill`)
// shade between two points or two circles in their own coordinate space, so
// a gradient is written once in gradient space and placed on each shape with
// a matrix, which keeps gradientUnits, gradientTransform and per-shape
// transforms exact.
import { parseColor, type RGBAColor, rgbToCmyk } from "./parse-color";
import {
  IDENTITY,
  type Matrix,
  multiply,
  parseTransform,
  type Segment,
  type SvgNode,
} from "./svg-geometry";

export interface ShadingStop {
  /** 0–1, never below the previous stop's offset */
  offset: number;
  color: RGBAColor;
}

/** A gradient element with the attributes and stops it inherits via `href`. */
export interface SvgGradient {
  kind: "linear" | "radial";
  attrs: Record<string, string>;
  stops: ShadingStop[];
}

/** A gradient placed on one shape. */
export interface PlacedGradient {
  kind: "linear" | "radial";
  /**
   * Shading `Coords` in gradient space: `[x1 y1 x2 y2]` for linear,
   * `[fx fy fr cx cy r]` (focal circle to end circle) for radial.
   */
  coords: number[];
  /** Gradient space → the shape's user space */
  matrix: Matrix;
  stops: ShadingStop[];
}

export type ShadingColorSpace = "rgb" | "cmyk";

const SHARED_ATTRIBUTES = [
  "gradientUnits",
  "gradientTransform",
  "spreadMethod",
];
const GEOMETRY_ATTRIBUTES = {
  linear: ["x1", "y1", "x2", "y2"],
  radial: ["cx", "cy", "r", "fx", "fy", "fr"],
} as const;

const BLACK: RGBAColor = { r: 0, g: 0, b: 0, a: 1 };

function presentation(node: SvgNode, name: string): string | undefined {
  for (const declaration of (node.attrs.style ?? "").split(";")) {
    const [key, ...rest] = declaration.split(":");
    if (key?.trim() === name) {
      return rest.join(":").trim();
    }
  }
  return node.attrs[name];
}

function gradientKind(node: SvgNode): SvgGradient["kind"] | null {
  if (node.name === "linearGradient") {
    return "linear";
  }
  return node.name === "radialGradient" ? "radial" : null;
}

function readStops(node: SvgNode): ShadingStop[] {
  const stops: ShadingStop[] = [];
  let previous = 0;
  for (const child of node.children) {
    if (child.name !== "stop") {
      continue;
    }
    const raw = (child.attrs.offset ?? "0").trim();
    const number = Number.parseFloat(raw);
    const value = Number.isFinite(number)
      ? raw.endsWith("%")
        ? number / 100
        : number
      : 0;
    // SVG clamps offsets to 0–1 and never lets one go below the one before.
    previous = Math.max(previous, Math.min(Math.max(value, 0), 1));
    const color = presentation(child, "stop-color") ?? "#000000";
    stops.push({
      offset: previous,
      color: parseColor(color === "currentColor" ? "#000000" : color) ?? BLACK,
    });
  }
  return stops;
}

/** Every gradient in the tree by id, with `href` inheritance resolved. */
export function collectGradients(root: SvgNode): Map<string, SvgGradient> {
  const elements = new Map<string, SvgNode>();
  const visit = (node: SvgNode) => {
    const id = node.attrs.id;
    if (gradientKind(node) && id && !elements.has(id)) {
      elements.set(id, node);
    }
    for (const child of node.children) {
      visit(child);
    }
  };
  visit(root);

  const gradients = new Map<string, SvgGradient>();
  for (const [id, element] of elements) {
    const kind = gradientKind(element) as SvgGradient["kind"];
    const attrs: Record<string, string> = {};
    let stops: ShadingStop[] = [];
    const seen = new Set<SvgNode>();
    let current: SvgNode | undefined = element;
    while (current && !seen.has(current)) {
      seen.add(current);
      const names =
        gradientKind(current) === kind
          ? [...SHARED_ATTRIBUTES, ...GEOMETRY_ATTRIBUTES[kind]]
          : SHARED_ATTRIBUTES;
      for (const name of names) {
        const value = current.attrs[name];
        if (attrs[name] === undefined && value !== undefined) {
          attrs[name] = value;
        }
      }
      if (stops.length === 0) {
        stops = readStops(current);
      }
      const href: string | undefined =
        current.attrs.href ?? current.attrs["xlink:href"];
      current = href?.startsWith("#") ? elements.get(href.slice(1)) : undefined;
    }
    gradients.set(id, { kind, attrs, stops });
  }
  return gradients;
}

/** Tight bounding box of segments (cubic extrema included). */
function boundingBox(segments: Segment[]) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const add = (x: number, y: number) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  };
  // Parameters in (0, 1) where one axis of a cubic turns.
  const extrema = (p0: number, p1: number, p2: number, p3: number) => {
    const a = -p0 + 3 * p1 - 3 * p2 + p3;
    const b = 2 * (p0 - 2 * p1 + p2);
    const c = p1 - p0;
    if (Math.abs(a) < 1e-12) {
      return Math.abs(b) < 1e-12 ? [] : [-c / b];
    }
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) {
      return [];
    }
    const root = Math.sqrt(discriminant);
    return [(-b + root) / (2 * a), (-b - root) / (2 * a)];
  };
  const at = (t: number, p0: number, p1: number, p2: number, p3: number) => {
    const u = 1 - t;
    return (
      u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t ** 3 * p3
    );
  };
  let x = 0;
  let y = 0;
  let start: [number, number] = [0, 0];
  for (const segment of segments) {
    if (segment.op === "M") {
      start = [segment.x, segment.y];
    }
    if (segment.op === "M" || segment.op === "L") {
      add(segment.x, segment.y);
      x = segment.x;
      y = segment.y;
    } else if (segment.op === "C") {
      add(segment.x, segment.y);
      for (const t of [
        ...extrema(x, segment.x1, segment.x2, segment.x),
        ...extrema(y, segment.y1, segment.y2, segment.y),
      ]) {
        if (t > 0 && t < 1) {
          add(
            at(t, x, segment.x1, segment.x2, segment.x),
            at(t, y, segment.y1, segment.y2, segment.y)
          );
        }
      }
      x = segment.x;
      y = segment.y;
    } else {
      [x, y] = start;
    }
  }
  return Number.isFinite(minX)
    ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
    : null;
}

const determinant = (m: Matrix) => m[0] * m[3] - m[1] * m[2];

/** Inverse of an affine matrix, or null when it is singular. */
export function invertMatrix(m: Matrix): Matrix | null {
  const det = determinant(m);
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) {
    return null;
  }
  const [a, b, c, d, e, f] = m;
  return [
    d / det,
    -b / det,
    -c / det,
    a / det,
    (c * f - d * e) / det,
    (b * e - a * f) / det,
  ];
}

/**
 * Places a gradient on a shape (segments in the shape's user space, `viewport`
 * for percentage lengths). Returns the solid color SVG paints instead when the
 * gradient is degenerate (one stop, a zero-length vector, a zero radius), or
 * null when the shape gets no paint (no stops, all stops transparent, a
 * bounding box with no width or height).
 *
 * `spreadMethod` reflect/repeat are drawn as pad, and stop opacity is ignored
 * (PostScript has no transparency; the PDF stays consistent with it).
 */
export function placeGradient(
  gradient: SvgGradient,
  segments: Segment[],
  viewport: [number, number]
): PlacedGradient | RGBAColor | null {
  const { kind, attrs, stops } = gradient;
  const first = stops[0];
  const last = stops.at(-1);
  if (!(first && last) || stops.every((stop) => stop.color.a === 0)) {
    return null;
  }
  if (stops.length === 1) {
    return first.color;
  }

  const userSpace = attrs.gradientUnits === "userSpaceOnUse";
  let base: Matrix = IDENTITY;
  if (!userSpace) {
    const box = boundingBox(segments);
    if (!box || box.width <= 0 || box.height <= 0) {
      return null;
    }
    base = [box.width, 0, 0, box.height, box.x, box.y];
  }
  const matrix = multiply(base, parseTransform(attrs.gradientTransform));
  if (!invertMatrix(matrix)) {
    return last.color;
  }

  const [width, height] = viewport;
  const diagonal = Math.sqrt((width * width + height * height) / 2);
  // Percentages resolve against the viewport in user space and are plain
  // fractions of the bounding box otherwise.
  const parse = (raw: string, reference: number) => {
    const number = Number.parseFloat(raw);
    if (!Number.isFinite(number)) {
      return null;
    }
    return raw.trim().endsWith("%")
      ? (number / 100) * (userSpace ? reference : 1)
      : number;
  };
  const length = (name: string, fallback: string, reference: number) =>
    parse(attrs[name] ?? fallback, reference) ??
    parse(fallback, reference) ??
    0;

  if (kind === "linear") {
    const coords = [
      length("x1", "0%", width),
      length("y1", "0%", height),
      length("x2", "100%", width),
      length("y2", "0%", height),
    ];
    const [x1, y1, x2, y2] = coords as [number, number, number, number];
    if (x1 === x2 && y1 === y2) {
      return last.color;
    }
    return { kind, coords, matrix, stops };
  }

  const cx = length("cx", "50%", width);
  const cy = length("cy", "50%", height);
  const r = length("r", "50%", diagonal);
  const fx = attrs.fx === undefined ? cx : length("fx", "50%", width);
  const fy = attrs.fy === undefined ? cy : length("fy", "50%", height);
  const fr = Math.max(0, length("fr", "0%", diagonal));
  if (r < 0) {
    return null;
  }
  if (r === 0) {
    return last.color;
  }
  return { kind, coords: [fx, fy, fr, cx, cy, r], matrix, stops };
}

/** Number for PDF and PostScript: no exponent, no "-0". */
export function formatNumber(value: number, digits = 6): string {
  const scale = 10 ** digits;
  const rounded = Math.round(value * scale) / scale;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

export function formatMatrix(matrix: Matrix): string {
  return matrix.map((value) => formatNumber(value)).join(" ");
}

function components(color: RGBAColor, space: ShadingColorSpace): string {
  const values =
    space === "cmyk"
      ? rgbToCmyk(color.r, color.g, color.b)
      : [color.r / 255, color.g / 255, color.b / 255];
  return values.map((value) => formatNumber(value, 4)).join(" ");
}

const exponential = (c0: string, c1: string) =>
  `<< /FunctionType 2 /Domain [0 1] /C0 [${c0}] /C1 [${c1}] /N 1 >>`;

/**
 * Color function over t in [0, 1] for the stops: the first color up to the
 * first stop, linear blends between stops (equal offsets make a hard edge),
 * the last color after the last stop. One piece is a Type 2 (exponential)
 * function; several are stitched with a Type 3 function.
 */
function stopFunction(stops: ShadingStop[], space: ShadingColorSpace) {
  const pieces: { from: number; to: number; c0: string; c1: string }[] = [];
  const offsets = stops.map((stop) => Number(formatNumber(stop.offset, 4)));
  const colors = stops.map((stop) => components(stop.color, space));
  const firstOffset = offsets[0] as number;
  const lastOffset = offsets.at(-1) as number;
  if (firstOffset > 0) {
    const color = colors[0] as string;
    pieces.push({ from: 0, to: firstOffset, c0: color, c1: color });
  }
  for (let i = 0; i + 1 < stops.length; i++) {
    const from = offsets[i] as number;
    const to = offsets[i + 1] as number;
    if (to > from) {
      pieces.push({
        from,
        to,
        c0: colors[i] as string,
        c1: colors[i + 1] as string,
      });
    }
  }
  if (lastOffset < 1) {
    const color = colors.at(-1) as string;
    pieces.push({ from: lastOffset, to: 1, c0: color, c1: color });
  }
  if (pieces.length === 1) {
    const [piece] = pieces as [(typeof pieces)[number]];
    return exponential(piece.c0, piece.c1);
  }
  return [
    "<< /FunctionType 3 /Domain [0 1]",
    `/Functions [${pieces.map((piece) => exponential(piece.c0, piece.c1)).join(" ")}]`,
    `/Bounds [${pieces
      .slice(1)
      .map((piece) => formatNumber(piece.from, 4))
      .join(" ")}]`,
    `/Encode [${pieces.map(() => "0 1").join(" ")}] >>`,
  ].join(" ");
}

/**
 * Shading dictionary for a placed gradient, valid both as a PDF object and as
 * PostScript LanguageLevel 3 `shfill` operand. Its `Coords` are in gradient
 * space: concatenate `gradient.matrix` (and the shape's matrix) first.
 * Colors use the same space as the writer's solid fills (DeviceCMYK through
 * `rgbToCmyk` in "cmyk" mode), so the blend runs between the converted stops.
 */
export function shadingDictionary(
  gradient: PlacedGradient,
  space: ShadingColorSpace
): string {
  return [
    `<< /ShadingType ${gradient.kind === "linear" ? 2 : 3}`,
    `/ColorSpace /Device${space === "cmyk" ? "CMYK" : "RGB"}`,
    `/Coords [${gradient.coords.map((value) => formatNumber(value)).join(" ")}]`,
    `/Function ${stopFunction(gradient.stops, space)}`,
    "/Extend [true true] >>",
  ].join(" ");
}
