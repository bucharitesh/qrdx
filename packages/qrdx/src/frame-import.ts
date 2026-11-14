/** biome-ignore-all lint/style/noMagicNumbers: import limits */
// Converts an uploaded SVG into a frame spec (types/frame-spec.ts), for a
// server to call. The SVG itself is never kept: only plain filled shapes
// survive, as path data re-written from parsed numbers, with colors as hex.
//
// Defences, in order:
// - size cap, and no DOCTYPE, entity, or processing instruction other than
//   the XML declaration (no entity expansion, no external DTD);
// - a linear well-formedness scan before the engine's SVG reader runs, so
//   hostile markup can't make its regular expressions backtrack; it also
//   caps the element count and nesting depth;
// - an allow-list walk: svg, g, path, rect, circle, ellipse, polygon,
//   polyline and line are read for geometry and fill/stroke color only.
//   script, style, foreignObject, image, use, text, filters, masks, clip
//   paths, patterns, animation and unknown elements are dropped; no
//   attribute is ever copied, so on* handlers, href / xlink:href and
//   url(...) references go with them (internal gradients are flattened to
//   their first color);
// - segment, shape and color caps, and the result must pass frameSpecSchema (checked without zod, by
//   parseFrameSpec).
// Everything dropped is reported as a warning.
import type { FrameSpec } from "../types/frame-spec";
import { parseFrameSpec } from "../types/frame-spec-parse";
import {
  FRAME_SPEC_KIND,
  FRAME_SPEC_LIMITS,
  FRAME_SPEC_VERSION,
} from "../types/frame-spec-rules";
import { fmt } from "./utils/fmt";
import { parseColor } from "./utils/parse-color";
import {
  type ClipBox,
  clipPolygon,
  flattenSegments,
  segmentsBounds,
} from "./utils/polygon-clip";
import {
  applyMatrix,
  ellipseSegments,
  type Matrix,
  multiply,
  parseNumbers,
  parsePathData,
  parseSvgMarkup,
  parseTransform,
  rectSegments,
  type Segment,
  type SvgNode,
} from "./utils/svg-geometry";
import { readStyle } from "./utils/svg-painter";

export const FRAME_IMPORT_LIMITS = {
  /** Largest SVG accepted, in UTF-8 bytes */
  maxBytes: 200_000,
  maxElements: 500,
  maxDepth: 16,
  /** Segments read from the SVG, before simplifying */
  maxInputSegments: 4000,
  /** Distinct fill colors kept (closer ones are merged) */
  maxColors: 8,
  /** The artboard's longer side, in spec units */
  artboardSide: 1000,
  /** Decimals kept in the spec's path data */
  decimals: 1,
  /** Default light padding around the code, as a share of its size */
  padding: 0.06,
} as const;

export interface FrameImportWarning {
  code: string;
  message: string;
  count: number;
}

export interface FrameImportColor {
  color: string;
  /** What the color became: a theme token or a fixed color */
  ref: "frame" | "accent" | "fixed";
  /** Shapes painted with it */
  shapes: number;
}

export interface FrameImportOptions {
  /**
   * Where the code goes, in the SVG's own units (its viewBox). By default a
   * rect with the id "qr" (or "qr-code", "qrdx-qr") marks it and isn't
   * drawn; without one, the code is centered at 60% of the shorter side.
   */
  qr?: { x: number; y: number; size: number };
  /** Light padding around the code, as a share of its size (default 0.06) */
  padding?: number;
}

export type FrameImportResult =
  | {
      ok: true;
      spec: FrameSpec;
      warnings: FrameImportWarning[];
      palette: FrameImportColor[];
    }
  | { ok: false; error: string; warnings: FrameImportWarning[] };

class ImportError extends Error {}

// ── Warnings ───────────────────────────────────────────────────────────────

const WARNINGS: Record<string, (count: number) => string> = {
  script: (n) => `Removed ${plural(n, "script")}`,
  style: (n) =>
    `Removed ${plural(n, "style sheet")}: colors set with CSS classes are lost. Export with presentation attributes (Illustrator: Styling → Presentation Attributes)`,
  "foreign-object": (n) => `Removed ${plural(n, "foreignObject element")}`,
  image: (n) => `Removed ${plural(n, "image")}: frames are vector shapes only`,
  use: (n) =>
    `Removed ${plural(n, "<use> reference")}: ungroup or detach symbols before exporting`,
  text: (n) =>
    `Removed ${plural(n, "text element")}: add text as labels in the frame editor`,
  effects: (n) => `Removed ${plural(n, "filter, mask, clip path or pattern")}`,
  animation: (n) => `Removed ${plural(n, "animation")}`,
  unknown: (n) => `Removed ${plural(n, "unsupported element")}`,
  "nested-svg": (n) => `Removed ${plural(n, "nested <svg>")}: flatten it first`,
  handlers: (n) => `Removed ${plural(n, "event handler attribute")}`,
  links: (n) => `Removed ${plural(n, "link")} (href)`,
  "external-paint": (n) =>
    `Removed ${plural(n, "fill or stroke")} that referenced something outside the file`,
  gradient: (n) =>
    `Flattened ${plural(n, "gradient")} to its first color: add gradients in the frame editor`,
  opacity: (n) =>
    `Made ${plural(n, "semi-transparent shape")} opaque (print files have no transparency)`,
  "invalid-paint": (n) =>
    `${plural(n, "color")} couldn't be read and fell back to the parent color`,
  stroke: (n) =>
    `Removed ${plural(n, "stroke")} on paths, polygons or polylines: outline strokes before exporting (Figma: Outline stroke)`,
  dash: (n) => `Drew ${plural(n, "dashed stroke")} as solid`,
  clipped: (n) => `Cut ${plural(n, "shape")} at the edge of the artboard`,
  outside: (n) => `Removed ${plural(n, "shape")} outside the artboard`,
  colors: (n) =>
    `Merged ${plural(n, "color")} with similar ones (${FRAME_IMPORT_LIMITS.maxColors} at most)`,
  "qr-placed": () =>
    'No QR placeholder found (a rect with id "qr"): the code was centered; place it in the frame editor',
};

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

class Warnings {
  private readonly counts = new Map<string, number>();

  add(code: keyof typeof WARNINGS, count = 1) {
    this.counts.set(code, (this.counts.get(code) ?? 0) + count);
  }

  list(): FrameImportWarning[] {
    return [...this.counts].map(([code, count]) => ({
      code,
      count,
      message: (WARNINGS[code] as (count: number) => string)(count),
    }));
  }
}

// ── Markup checks ──────────────────────────────────────────────────────────

const XML_DECLARATION = /^\s*<\?xml\s[^?>]*\?>/;
const TAG_NAME = /[A-Za-z_][\w:.-]*/y;
const CLOSE_TAG = /<\/([A-Za-z_][\w:.-]*)\s*>/y;

// Attributes and tag ends are read one character class at a time, so no
// pattern can backtrack. The steps accept exactly what
// /\s+[A-Za-z_:][\w:.-]*\s*=\s*(?:"[^"<]*"|'[^'<]*')/y and /\s*(\/?)>/y did.
const SPACES = /\s*/y;
const ATTRIBUTE_NAME = /[A-Za-z_:][\w:.-]*/y;
const DOUBLE_QUOTED = /[^"<]*/y;
const SINGLE_QUOTED = /[^'<]*/y;

/** Where sticky `pattern` stops matching at `from` (`from` when it doesn't). */
function skip(pattern: RegExp, markup: string, from: number): number {
  pattern.lastIndex = from;
  return pattern.test(markup) ? pattern.lastIndex : from;
}

/** The end of the ` name="value"` attribute at `from`, or -1. */
function attributeEnd(markup: string, from: number): number {
  const nameStart = skip(SPACES, markup, from);
  const nameEnd = skip(ATTRIBUTE_NAME, markup, nameStart);
  if (nameStart === from || nameEnd === nameStart) {
    return -1;
  }
  const equals = skip(SPACES, markup, nameEnd);
  if (markup[equals] !== "=") {
    return -1;
  }
  const open = skip(SPACES, markup, equals + 1);
  const quote = markup[open];
  if (quote !== '"' && quote !== "'") {
    return -1;
  }
  const value = quote === '"' ? DOUBLE_QUOTED : SINGLE_QUOTED;
  const close = skip(value, markup, open + 1);
  return markup[close] === quote ? close + 1 : -1;
}

/** The end of the ">" or "/>" after optional whitespace at `from`. */
function tagEnd(
  markup: string,
  from: number
): { end: number; selfClosing: boolean } | null {
  const at = skip(SPACES, markup, from);
  if (markup[at] === ">") {
    return { end: at + 1, selfClosing: false };
  }
  return markup.startsWith("/>", at)
    ? { end: at + 2, selfClosing: true }
    : null;
}

/**
 * Linear well-formedness scan: tags, attributes (quoted values without
 * "<"), comments and CDATA must be complete, closing tags must match, and
 * the element count and depth stay within the limits. Returns the first
 * element's name.
 */
function scanMarkup(markup: string): string {
  const stack: string[] = [];
  let elements = 0;
  let first = "";
  let index = 0;
  while (index < markup.length) {
    const open = markup.indexOf("<", index);
    if (open < 0) {
      break;
    }
    index = open;
    if (markup.startsWith("<!--", index)) {
      const end = markup.indexOf("-->", index + 4);
      if (end < 0) {
        throw new ImportError("The SVG has an unclosed comment");
      }
      index = end + 3;
      continue;
    }
    if (markup.startsWith("<![CDATA[", index)) {
      const end = markup.indexOf("]]>", index + 9);
      if (end < 0) {
        throw new ImportError("The SVG has an unclosed CDATA section");
      }
      index = end + 3;
      continue;
    }
    if (markup.startsWith("<?", index)) {
      const end = markup.indexOf("?>", index + 2);
      if (end < 0) {
        throw new ImportError("The SVG has an unclosed declaration");
      }
      index = end + 2;
      continue;
    }
    if (markup.startsWith("<!", index)) {
      throw new ImportError("DOCTYPE and other declarations are not allowed");
    }
    if (markup[index + 1] === "/") {
      CLOSE_TAG.lastIndex = index;
      const close = CLOSE_TAG.exec(markup);
      if (!close) {
        throw new ImportError("The SVG has a malformed closing tag");
      }
      if (stack.pop() !== close[1]) {
        throw new ImportError(`The SVG closes <${close[1]}> out of order`);
      }
      index = CLOSE_TAG.lastIndex;
      continue;
    }
    TAG_NAME.lastIndex = index + 1;
    const name = TAG_NAME.exec(markup);
    if (!name) {
      throw new ImportError("The SVG has a malformed tag");
    }
    let position = TAG_NAME.lastIndex;
    for (
      let next = attributeEnd(markup, position);
      next >= 0;
      next = attributeEnd(markup, position)
    ) {
      position = next;
    }
    const end = tagEnd(markup, position);
    if (!end) {
      throw new ImportError(
        `The SVG has a malformed <${name[0]}> tag (attributes must be quoted and may not contain "<")`
      );
    }
    elements++;
    if (elements > FRAME_IMPORT_LIMITS.maxElements) {
      throw new ImportError(
        `The SVG has more than ${FRAME_IMPORT_LIMITS.maxElements} elements`
      );
    }
    if (!first) {
      first = name[0];
    }
    if (!end.selfClosing) {
      stack.push(name[0]);
      if (stack.length > FRAME_IMPORT_LIMITS.maxDepth) {
        throw new ImportError(
          `The SVG nests elements more than ${FRAME_IMPORT_LIMITS.maxDepth} deep`
        );
      }
    }
    index = end.end;
  }
  if (stack.length > 0) {
    throw new ImportError(`The SVG doesn't close <${stack.at(-1)}>`);
  }
  return first;
}

function checkMarkup(svg: unknown): string {
  if (typeof svg !== "string") {
    throw new ImportError("Expected SVG markup as a string");
  }
  const bytes = new TextEncoder().encode(svg).length;
  if (bytes > FRAME_IMPORT_LIMITS.maxBytes) {
    throw new ImportError(
      `The SVG is ${Math.ceil(bytes / 1000)} KB; the limit is ${FRAME_IMPORT_LIMITS.maxBytes / 1000} KB`
    );
  }
  if (/<!(?:DOCTYPE|ENTITY|ATTLIST|ELEMENT|NOTATION)/i.test(svg)) {
    throw new ImportError("DOCTYPE and entity declarations are not allowed");
  }
  const body = svg.replace(XML_DECLARATION, "");
  if (body.includes("<?")) {
    throw new ImportError(
      "Processing instructions (such as xml-stylesheet) are not allowed"
    );
  }
  if (scanMarkup(body) !== "svg") {
    throw new ImportError("The file must start with an <svg> element");
  }
  return body;
}

// ── Paint ──────────────────────────────────────────────────────────────────

interface State {
  matrix: Matrix;
  fill: string;
  fillRule: "nonzero" | "evenodd";
  stroke: string;
  strokeWidth: number;
  color: string;
  opacity: number;
}

const toHex = (value: number) =>
  Math.round(Math.min(255, Math.max(0, value)))
    .toString(16)
    .padStart(2, "0");

function cleanValue(value: string | undefined): string | undefined {
  const clean = value?.replace(/!important/i, "").trim();
  return clean === "" || clean === "inherit" ? undefined : clean;
}

/** A fill or stroke as an opaque hex color, or null for none. */
function resolvePaint(
  value: string,
  state: State,
  gradients: Map<string, string>,
  warnings: Warnings
): string | null {
  const paint = value.trim();
  if (paint === "none" || paint === "transparent") {
    return null;
  }
  if (/^url\(/i.test(paint)) {
    const id = /^url\(\s*['"]?#([^)'"\s]+)['"]?\s*\)/i.exec(paint)?.[1];
    const first = id ? gradients.get(id) : undefined;
    if (!first) {
      warnings.add("external-paint");
      return null;
    }
    warnings.add("gradient");
    return resolvePaint(first, state, gradients, warnings);
  }
  const color = parseColor(paint === "currentColor" ? state.color : paint);
  if (!color) {
    warnings.add("invalid-paint");
    return null;
  }
  if (color.a <= 0) {
    return null;
  }
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

/** First stop color of every gradient with an id (following href once). */
function collectGradients(root: SvgNode): Map<string, string> {
  const nodes = new Map<string, SvgNode>();
  const visit = (node: SvgNode) => {
    if (
      (node.name === "linearGradient" || node.name === "radialGradient") &&
      node.attrs.id
    ) {
      nodes.set(node.attrs.id, node);
    }
    for (const child of node.children) {
      visit(child);
    }
  };
  visit(root);
  const out = new Map<string, string>();
  for (const [id, node] of nodes) {
    let stop = node.children.find((child) => child.name === "stop");
    if (!stop) {
      const ref = (node.attrs.href ?? node.attrs["xlink:href"])?.match(
        /^#(.+)$/
      )?.[1];
      stop = ref
        ? nodes.get(ref)?.children.find((child) => child.name === "stop")
        : undefined;
    }
    const color = stop && cleanValue(readStyle(stop, "stop-color"));
    if (color) {
      out.set(id, color);
    }
  }
  return out;
}

// ── Geometry ───────────────────────────────────────────────────────────────

interface Shape {
  segments: Segment[];
  fill: string;
  fillRule: "nonzero" | "evenodd";
}

function transformSegments(segments: Segment[], m: Matrix): Segment[] {
  return segments.map((segment) => {
    if (segment.op === "Z") {
      return segment;
    }
    if (segment.op === "C") {
      const [x1, y1] = applyMatrix(m, segment.x1, segment.y1);
      const [x2, y2] = applyMatrix(m, segment.x2, segment.y2);
      const [x, y] = applyMatrix(m, segment.x, segment.y);
      return { op: "C", x1, y1, x2, y2, x, y };
    }
    const [x, y] = applyMatrix(m, segment.x, segment.y);
    return { op: segment.op, x, y };
  });
}

function signedArea(points: [number, number][]): number {
  let sum = 0;
  points.forEach(([x, y], i) => {
    const [nx, ny] = points[(i + 1) % points.length] as [number, number];
    sum += x * ny - nx * y;
  });
  return sum / 2;
}

function polygonSegments(points: [number, number][]): Segment[] {
  if (points.length < 3) {
    return [];
  }
  return [
    ...points.map(([x, y], i): Segment => ({ op: i === 0 ? "M" : "L", x, y })),
    { op: "Z" },
  ];
}

const isNumber = (value: number) => Number.isFinite(value);

function num(node: SvgNode, name: string, fallback = 0): number {
  const value = Number.parseFloat(node.attrs[name] ?? "");
  return isNumber(value) ? value : fallback;
}

/** Fill outline of a shape element, in its own coordinates. */
function fillGeometry(node: SvgNode): Segment[] {
  switch (node.name) {
    case "path":
      return parsePathData(node.attrs.d ?? "");
    case "rect": {
      const rx = node.attrs.rx ?? node.attrs.ry;
      const ry = node.attrs.ry ?? node.attrs.rx;
      return rectSegments(
        num(node, "x"),
        num(node, "y"),
        num(node, "width"),
        num(node, "height"),
        Number.parseFloat(rx ?? "0") || 0,
        Number.parseFloat(ry ?? "0") || 0
      );
    }
    case "circle": {
      const r = num(node, "r");
      return ellipseSegments(num(node, "cx"), num(node, "cy"), r, r);
    }
    case "ellipse":
      return ellipseSegments(
        num(node, "cx"),
        num(node, "cy"),
        num(node, "rx"),
        num(node, "ry")
      );
    case "polygon":
    case "polyline": {
      const values = parseNumbers(node.attrs.points);
      const points: [number, number][] = [];
      for (let i = 0; i + 1 < values.length; i += 2) {
        points.push([values[i] as number, values[i + 1] as number]);
      }
      return polygonSegments(points);
    }
    default:
      return [];
  }
}

/**
 * Stroke outline (even-odd) for the elements whose stroke has a simple
 * outline: rects, circles, ellipses and lines. Null for the rest.
 */
function strokeGeometry(node: SvgNode, width: number): Segment[] | null {
  const half = width / 2;
  switch (node.name) {
    case "rect": {
      const x = num(node, "x");
      const y = num(node, "y");
      const w = num(node, "width");
      const h = num(node, "height");
      const r = Number.parseFloat(node.attrs.rx ?? node.attrs.ry ?? "0") || 0;
      const outer = rectSegments(
        x - half,
        y - half,
        w + width,
        h + width,
        r > 0 ? r + half : 0,
        r > 0 ? r + half : 0
      );
      if (w <= width || h <= width) {
        return outer;
      }
      const innerRadius = Math.max(r - half, 0);
      return [
        ...outer,
        ...rectSegments(
          x + half,
          y + half,
          w - width,
          h - width,
          innerRadius,
          innerRadius
        ),
      ];
    }
    case "circle":
    case "ellipse": {
      const cx = num(node, "cx");
      const cy = num(node, "cy");
      const rx = node.name === "circle" ? num(node, "r") : num(node, "rx");
      const ry = node.name === "circle" ? num(node, "r") : num(node, "ry");
      const outer = ellipseSegments(cx, cy, rx + half, ry + half);
      if (rx <= half || ry <= half) {
        return outer;
      }
      return [...outer, ...ellipseSegments(cx, cy, rx - half, ry - half)];
    }
    case "line": {
      const [x1, y1, x2, y2] = ["x1", "y1", "x2", "y2"].map((name) =>
        num(node, name)
      ) as [number, number, number, number];
      const length = Math.hypot(x2 - x1, y2 - y1);
      if (length === 0) {
        return [];
      }
      const nx = (-(y2 - y1) / length) * half;
      const ny = ((x2 - x1) / length) * half;
      const quad: [number, number][] = [
        [x1 + nx, y1 + ny],
        [x2 + nx, y2 + ny],
        [x2 - nx, y2 - ny],
        [x1 - nx, y1 - ny],
      ];
      return polygonSegments(signedArea(quad) < 0 ? quad.reverse() : quad);
    }
    default:
      return null;
  }
}

// ── Walk ───────────────────────────────────────────────────────────────────

const SHAPES = new Set([
  "path",
  "rect",
  "circle",
  "ellipse",
  "polygon",
  "polyline",
  "line",
]);
const SILENT = new Set([
  "defs",
  "linearGradient",
  "radialGradient",
  "stop",
  "title",
  "desc",
  "metadata",
]);
const DROPPED: Record<string, keyof typeof WARNINGS> = {
  script: "script",
  style: "style",
  foreignObject: "foreign-object",
  image: "image",
  feImage: "image",
  use: "use",
  text: "text",
  tspan: "text",
  textPath: "text",
  filter: "effects",
  mask: "effects",
  clipPath: "effects",
  pattern: "effects",
  marker: "effects",
  symbol: "effects",
  animate: "animation",
  animateMotion: "animation",
  animateTransform: "animation",
  set: "animation",
};

const QR_PLACEHOLDER = /^(?:qrdx[-_ ]?)?qr(?:[-_ ]?code)?$/i;

interface Collected {
  shapes: Shape[];
  qrBox: ClipBox | null;
  segments: number;
}

function checkAttributes(node: SvgNode, warnings: Warnings) {
  for (const name of Object.keys(node.attrs)) {
    const lower = name.toLowerCase();
    if (lower.startsWith("on")) {
      warnings.add("handlers");
    } else if (lower === "href" || lower === "xlink:href") {
      if (node.name !== "linearGradient" && node.name !== "radialGradient") {
        warnings.add("links");
      }
    } else if (
      lower === "filter" ||
      lower === "mask" ||
      lower === "clip-path"
    ) {
      warnings.add("effects");
    }
  }
}

function walk(
  node: SvgNode,
  parent: State,
  gradients: Map<string, string>,
  warnings: Warnings,
  out: Collected
) {
  checkAttributes(node, warnings);
  if (
    cleanValue(readStyle(node, "display")) === "none" ||
    cleanValue(readStyle(node, "visibility")) === "hidden"
  ) {
    return;
  }
  const opacity = Number.parseFloat(readStyle(node, "opacity") ?? "1");
  const fillRule = cleanValue(readStyle(node, "fill-rule"));
  const strokeWidth = Number.parseFloat(
    cleanValue(readStyle(node, "stroke-width")) ?? ""
  );
  const state: State = {
    matrix: multiply(parent.matrix, parseTransform(node.attrs.transform)),
    fill: cleanValue(readStyle(node, "fill")) ?? parent.fill,
    fillRule:
      fillRule === "evenodd" || fillRule === "nonzero"
        ? fillRule
        : parent.fillRule,
    stroke: cleanValue(readStyle(node, "stroke")) ?? parent.stroke,
    strokeWidth:
      isNumber(strokeWidth) && strokeWidth >= 0
        ? strokeWidth
        : parent.strokeWidth,
    color: cleanValue(readStyle(node, "color")) ?? parent.color,
    opacity: parent.opacity * (isNumber(opacity) ? opacity : 1),
  };
  for (const child of node.children) {
    if (SILENT.has(child.name)) {
      continue;
    }
    const dropped = DROPPED[child.name];
    if (dropped) {
      warnings.add(dropped);
      continue;
    }
    if (child.name === "svg") {
      warnings.add("nested-svg");
      continue;
    }
    if (child.name === "g" || child.name === "a") {
      walk(child, state, gradients, warnings, out);
      continue;
    }
    if (!SHAPES.has(child.name)) {
      warnings.add("unknown");
      continue;
    }
    shapeElement(child, state, gradients, warnings, out);
  }
}

function shapeElement(
  node: SvgNode,
  parent: State,
  gradients: Map<string, string>,
  warnings: Warnings,
  out: Collected
) {
  checkAttributes(node, warnings);
  if (
    cleanValue(readStyle(node, "display")) === "none" ||
    cleanValue(readStyle(node, "visibility")) === "hidden"
  ) {
    return;
  }
  const matrix = multiply(parent.matrix, parseTransform(node.attrs.transform));

  if (
    node.name === "rect" &&
    QR_PLACEHOLDER.test(node.attrs.id ?? "") &&
    !out.qrBox
  ) {
    out.qrBox = segmentsBounds(transformSegments(fillGeometry(node), matrix));
    return;
  }

  const read = (name: string) => cleanValue(readStyle(node, name));
  const opacity = parent.opacity * Number.parseFloat(read("opacity") ?? "1");
  const fillOpacity = Number.parseFloat(read("fill-opacity") ?? "1");
  const strokeOpacity = Number.parseFloat(read("stroke-opacity") ?? "1");
  const fillRule = read("fill-rule");
  const state: State = {
    ...parent,
    matrix,
    fill: read("fill") ?? parent.fill,
    fillRule:
      fillRule === "evenodd" || fillRule === "nonzero"
        ? fillRule
        : parent.fillRule,
    stroke: read("stroke") ?? parent.stroke,
    color: read("color") ?? parent.color,
  };
  const strokeWidthValue = Number.parseFloat(read("stroke-width") ?? "");
  const strokeWidth =
    isNumber(strokeWidthValue) && strokeWidthValue >= 0
      ? strokeWidthValue
      : parent.strokeWidth;

  const add = (segments: Segment[], fill: string, rule: Shape["fillRule"]) => {
    if (segments.length === 0) {
      return;
    }
    out.segments += segments.length;
    if (out.segments > FRAME_IMPORT_LIMITS.maxInputSegments) {
      throw new ImportError(
        `The SVG has more than ${FRAME_IMPORT_LIMITS.maxInputSegments} path segments; simplify it`
      );
    }
    out.shapes.push({
      segments: transformSegments(segments, matrix),
      fill,
      fillRule: rule,
    });
  };

  const visible = (alpha: number) => {
    const value =
      (isNumber(opacity) ? opacity : 1) * (isNumber(alpha) ? alpha : 1);
    if (value <= 0) {
      return false;
    }
    if (value < 1) {
      warnings.add("opacity");
    }
    return true;
  };

  if (node.name !== "line") {
    const fill = resolvePaint(state.fill, state, gradients, warnings);
    if (fill && visible(fillOpacity)) {
      add(fillGeometry(node), fill, state.fillRule);
    }
  }
  if (strokeWidth > 0 && state.stroke !== "none") {
    const stroke = resolvePaint(state.stroke, state, gradients, warnings);
    if (stroke && visible(strokeOpacity)) {
      const outline = strokeGeometry(node, strokeWidth);
      if (outline) {
        if ((read("stroke-dasharray") ?? "none") !== "none") {
          warnings.add("dash");
        }
        add(outline, stroke, node.name === "line" ? "nonzero" : "evenodd");
      } else {
        warnings.add("stroke");
      }
    }
  }
}

// ── Output ─────────────────────────────────────────────────────────────────

/** Path data with relative commands, rounded to `decimals`. */
function writeSegments(segments: Segment[], decimals: number): string {
  const round = (value: number) => {
    const scale = 10 ** decimals;
    return Math.round(value * scale) / scale + 0;
  };
  const n = (value: number) => fmt(value, decimals);
  let out = "";
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  for (const segment of segments) {
    if (segment.op === "Z") {
      out += "z";
      x = startX;
      y = startY;
      continue;
    }
    const ex = round(segment.x);
    const ey = round(segment.y);
    if (segment.op === "M") {
      out += `m${n(ex - x)} ${n(ey - y)}`;
      startX = ex;
      startY = ey;
    } else if (segment.op === "L") {
      if (ex === x && ey === y) {
        continue;
      }
      out +=
        ey === y
          ? `h${n(ex - x)}`
          : ex === x
            ? `v${n(ey - y)}`
            : `l${n(ex - x)} ${n(ey - y)}`;
    } else {
      out += `c${n(round(segment.x1) - x)} ${n(round(segment.y1) - y)} ${n(round(segment.x2) - x)} ${n(round(segment.y2) - y)} ${n(ex - x)} ${n(ey - y)}`;
    }
    x = ex;
    y = ey;
  }
  return out;
}

const overlaps = (a: ClipBox, b: ClipBox) =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** Joins neighbours in paint order with the same paint that don't touch. */
function mergeShapes(shapes: Shape[]): Shape[] {
  const merged: { shape: Shape; boxes: ClipBox[] }[] = [];
  for (const shape of shapes) {
    const box = segmentsBounds(shape.segments);
    if (!box) {
      continue;
    }
    const last = merged.at(-1);
    if (
      last &&
      last.shape.fill === shape.fill &&
      last.shape.fillRule === shape.fillRule &&
      !last.boxes.some((other) => overlaps(other, box))
    ) {
      last.shape = {
        ...last.shape,
        segments: [...last.shape.segments, ...shape.segments],
      };
      last.boxes.push(box);
    } else {
      merged.push({ shape, boxes: [box] });
    }
  }
  return merged.map((entry) => entry.shape);
}

const rgbOf = (hex: string) => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];

/** Merges the closest colors until at most `limit` remain. */
function limitColors(
  shapes: Shape[],
  limit: number,
  warnings: Warnings
): Map<string, string> {
  const weight = new Map<string, number>();
  for (const shape of shapes) {
    weight.set(shape.fill, (weight.get(shape.fill) ?? 0) + 1);
  }
  const mapping = new Map<string, string>(
    [...weight.keys()].map((color) => [color, color])
  );
  let merges = 0;
  while (weight.size > limit) {
    const colors = [...weight.keys()];
    let best: [string, string] = [colors[0] as string, colors[1] as string];
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < colors.length; i++) {
      for (let j = i + 1; j < colors.length; j++) {
        const a = rgbOf(colors[i] as string);
        const b = rgbOf(colors[j] as string);
        const d = Math.hypot(
          (a[0] as number) - (b[0] as number),
          (a[1] as number) - (b[1] as number),
          (a[2] as number) - (b[2] as number)
        );
        if (d < bestDistance) {
          bestDistance = d;
          best = [colors[i] as string, colors[j] as string];
        }
      }
    }
    const [a, b] = best;
    const [keep, drop] =
      (weight.get(a) ?? 0) >= (weight.get(b) ?? 0) ? [a, b] : [b, a];
    weight.set(keep, (weight.get(keep) ?? 0) + (weight.get(drop) ?? 0));
    weight.delete(drop);
    for (const [color, target] of mapping) {
      if (target === drop) {
        mapping.set(color, keep);
      }
    }
    merges++;
  }
  if (merges > 0) {
    warnings.add("colors", merges);
  }
  return mapping;
}

const isNearWhite = (hex: string) => {
  const [r, g, b] = rgbOf(hex) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 235;
};

/**
 * Converts SVG markup into a frame spec. Never throws: problems come back
 * as `{ ok: false, error }`, and everything that was dropped or changed is
 * listed in `warnings`.
 */
export function importFrameSvg(
  svg: string,
  options: FrameImportOptions = {}
): FrameImportResult {
  const warnings = new Warnings();
  try {
    const body = checkMarkup(svg);
    const root = parseSvgMarkup(body);
    if (!root) {
      throw new ImportError("No <svg> element found");
    }

    // Artboard: the viewBox, else width × height
    const viewBox = parseNumbers(root.attrs.viewBox);
    let [vx, vy, vw, vh] = [0, 0, 0, 0];
    if (
      viewBox.length === 4 &&
      (viewBox[2] as number) > 0 &&
      (viewBox[3] as number) > 0
    ) {
      [vx, vy, vw, vh] = viewBox as [number, number, number, number];
    } else {
      vw = num(root, "width");
      vh = num(root, "height");
    }
    if (!(isNumber(vw) && isNumber(vh) && vw > 0 && vh > 0)) {
      throw new ImportError("The SVG needs a viewBox (or a width and height)");
    }
    const side = FRAME_IMPORT_LIMITS.artboardSide;
    const k = side / Math.max(vw, vh);
    const width = Math.round(vw * k * 10) / 10;
    const height = Math.round(vh * k * 10) / 10;
    if (Math.min(width, height) < FRAME_SPEC_LIMITS.minArtboard) {
      throw new ImportError(
        "The artboard is too narrow: its sides may differ by 20 times at most"
      );
    }
    const toArtboard: Matrix = [k, 0, 0, k, -vx * k, -vy * k];

    const collected: Collected = { shapes: [], qrBox: null, segments: 0 };
    walk(
      root,
      {
        matrix: toArtboard,
        fill: "#000000",
        fillRule: "nonzero",
        stroke: "none",
        strokeWidth: 1,
        color: "#000000",
        opacity: 1,
      },
      collectGradients(root),
      warnings,
      collected
    );

    // Keep what lies on the artboard; cut what crosses its edge
    const artboard: ClipBox = { x0: 0, y0: 0, x1: width, y1: height };
    const tolerance = Math.max(width, height) * 0.004;
    const shapes: Shape[] = [];
    let outside = 0;
    let clipped = 0;
    for (const shape of collected.shapes) {
      const box = segmentsBounds(shape.segments);
      if (
        !box ||
        box.x1 <= 0 ||
        box.y1 <= 0 ||
        box.x0 >= width ||
        box.y0 >= height
      ) {
        outside++;
        continue;
      }
      if (
        box.x0 < -tolerance ||
        box.y0 < -tolerance ||
        box.x1 > width + tolerance ||
        box.y1 > height + tolerance
      ) {
        const pieces = flattenSegments(shape.segments, 0.25)
          .map((polygon) => clipPolygon(polygon, artboard))
          .filter((polygon) => polygon.length > 2);
        if (pieces.length === 0) {
          outside++;
          continue;
        }
        clipped++;
        shapes.push({
          ...shape,
          segments: pieces.flatMap((polygon) => polygonSegments(polygon)),
        });
      } else {
        shapes.push(shape);
      }
    }
    if (outside > 0) {
      warnings.add("outside", outside);
    }
    if (clipped > 0) {
      warnings.add("clipped", clipped);
    }
    if (shapes.length === 0) {
      throw new ImportError("The SVG has no filled shapes to use");
    }

    // Colors: the most used become the frame and accent tokens
    const mapping = limitColors(
      shapes,
      FRAME_IMPORT_LIMITS.maxColors,
      warnings
    );
    for (const shape of shapes) {
      shape.fill = mapping.get(shape.fill) ?? shape.fill;
    }
    const area = new Map<string, number>();
    const count = new Map<string, number>();
    for (const shape of shapes) {
      const box = segmentsBounds(shape.segments) as ClipBox;
      area.set(
        shape.fill,
        (area.get(shape.fill) ?? 0) + (box.x1 - box.x0) * (box.y1 - box.y0)
      );
      count.set(shape.fill, (count.get(shape.fill) ?? 0) + 1);
    }
    const ranked = [...area.keys()].sort(
      (a, b) =>
        Number(isNearWhite(a)) - Number(isNearWhite(b)) ||
        (area.get(b) as number) - (area.get(a) as number)
    );
    const frameColor = ranked[0] as string;
    const accentColor = ranked[1];
    const refOf = (color: string) =>
      color === frameColor ? "frame" : color === accentColor ? "accent" : color;

    // The code
    let qrBox: ClipBox | null = collected.qrBox;
    if (!qrBox && options.qr) {
      const [x0, y0] = applyMatrix(toArtboard, options.qr.x, options.qr.y);
      qrBox = {
        x0,
        y0,
        x1: x0 + options.qr.size * k,
        y1: y0 + options.qr.size * k,
      };
    }
    let size: number;
    let qrX: number;
    let qrY: number;
    if (qrBox) {
      size = Math.min(qrBox.x1 - qrBox.x0, qrBox.y1 - qrBox.y0);
      qrX = (qrBox.x0 + qrBox.x1 - size) / 2;
      qrY = (qrBox.y0 + qrBox.y1 - size) / 2;
    } else {
      warnings.add("qr-placed");
      size = Math.min(width, height) * 0.6;
      qrX = (width - size) / 2;
      qrY = (height - size) / 2;
    }
    const r1 = (value: number) => Math.round(value * 10) / 10 + 0;
    size = Math.floor(size * 10) / 10;
    qrX = r1(qrX);
    qrY = r1(qrY);
    if (size < Math.min(width, height) * FRAME_SPEC_LIMITS.minQrShare) {
      throw new ImportError(
        "The QR area must be at least half the frame's shorter side"
      );
    }
    const room = Math.min(qrX, qrY, width - qrX - size, height - qrY - size);
    if (room < size * FRAME_SPEC_LIMITS.minPadding - 1e-9) {
      throw new ImportError(
        "Leave room around the QR area: at least 4% of its size on every side, inside the artboard"
      );
    }
    const share = Math.min(
      Math.max(
        options.padding ?? FRAME_IMPORT_LIMITS.padding,
        FRAME_SPEC_LIMITS.minPadding
      ),
      0.2
    );
    const padding = Math.floor(Math.min(size * share, room) * 10) / 10;

    const merged = mergeShapes(shapes);
    if (merged.length > FRAME_SPEC_LIMITS.maxShapes) {
      throw new ImportError(
        `The artwork has ${merged.length} separate shapes; the limit is ${FRAME_SPEC_LIMITS.maxShapes}. Combine shapes of the same color first`
      );
    }

    const spec = {
      kind: FRAME_SPEC_KIND,
      version: FRAME_SPEC_VERSION,
      artboard: { width, height },
      qr: { x: qrX, y: qrY, size, padding },
      colors: {
        frame: frameColor,
        ...(accentColor && { accent: accentColor }),
      },
      shapes: merged.map((shape) => ({
        type: "path" as const,
        d: writeSegments(shape.segments, FRAME_IMPORT_LIMITS.decimals),
        fill: refOf(shape.fill),
        ...(shape.fillRule === "evenodd" && { fillRule: "evenodd" as const }),
      })),
      labels: [],
    };

    const result = parseFrameSpec(spec);
    if (!result.success) {
      const issue = result.issues[0];
      throw new ImportError(
        `The converted frame doesn't fit the frame format: ${issue?.message ?? "invalid"}`
      );
    }
    const palette: FrameImportColor[] = ranked.map((color) => ({
      color,
      ref:
        color === frameColor
          ? "frame"
          : color === accentColor
            ? "accent"
            : "fixed",
      shapes: count.get(color) ?? 0,
    }));
    return { ok: true, spec: result.data, warnings: warnings.list(), palette };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof ImportError
          ? error.message
          : `Could not read the SVG (${error instanceof Error ? error.name : "error"})`,
      warnings: warnings.list(),
    };
  }
}
