/** biome-ignore-all lint/style/noMagicNumbers: SVG painting */
// Walks the SVG this library renders and hands vector shapes, text and images
// to an output backend (PDF via jsPDF, EPS as PostScript).
import { angularSpan, arcsOverlap, flattenOver } from "./paint";
import { parseColor, type RGBAColor } from "./parse-color";
import {
  applyMatrix,
  ellipseSegments,
  type Matrix,
  multiply,
  parseNumbers,
  parsePathData,
  parseTransform,
  rectSegments,
  type Segment,
  type SvgNode,
} from "./svg-geometry";

import {
  boundingBox,
  invertMatrix,
  type PlacedGradient,
  placeGradient,
  type SvgGradient,
} from "./svg-gradient";

/** A path segment mapped through an affine `matrix`. */
function transformSegment(segment: Segment, matrix: Matrix): Segment {
  if (segment.op === "Z") {
    return segment;
  }
  if (segment.op === "C") {
    const [x1, y1] = applyMatrix(matrix, segment.x1, segment.y1);
    const [x2, y2] = applyMatrix(matrix, segment.x2, segment.y2);
    const [x, y] = applyMatrix(matrix, segment.x, segment.y);
    return { op: "C", x1, y1, x2, y2, x, y };
  }
  const [x, y] = applyMatrix(matrix, segment.x, segment.y);
  return { op: segment.op, x, y };
}

export interface PaintState {
  matrix: Matrix;
  fill: string;
  fillRule: string;
  stroke: string;
  strokeWidth: number;
  fontSize: number;
  fontWeight: string;
  textAnchor: string;
  /** Viewport size, for percentage lengths */
  viewport: [number, number];
  /** Inherited `fill-opacity` (1 when unset) */
  fillOpacity?: number;
  /**
   * `opacity` of this element times its ancestors' (1 when unset). Exact for
   * shapes that don't overlap inside a see-through group, as in QR codes.
   */
  opacity?: number;
}

export type PaintColor = RGBAColor | null;

/**
 * A fill: a solid color (its `a` folds in fill-opacity and opacity), a
 * gradient placed on the shape being painted (`alpha` multiplies its stops'
 * own alpha), or a userSpaceOnUse `<pattern>` (angular gradients and image
 * fills) whose content is painted inside the shape.
 */
export type FillPaint =
  | { color: RGBAColor }
  | { gradient: PlacedGradient; alpha: number }
  | { pattern: SvgNode; alpha: number };

const WHITE: RGBAColor = { r: 255, g: 255, b: 255, a: 1 };

const URL_REFERENCE = /^url\(\s*#([^)\s]+)\s*\)/;

const SKIPPED_ELEMENTS = new Set([
  "defs",
  "clipPath",
  "mask",
  "pattern",
  "linearGradient",
  "radialGradient",
  "symbol",
  "title",
  "desc",
  "metadata",
  "style",
  "script",
  "use",
  "foreignObject",
]);

export function readStyle(node: SvgNode, name: string): string | undefined {
  const inline = node.attrs.style;
  if (inline) {
    for (const declaration of inline.split(";")) {
      const [key, ...rest] = declaration.split(":");
      if (key?.trim() === name) {
        return rest.join(":").trim();
      }
    }
  }
  return node.attrs[name];
}

export function length(
  value: string | undefined,
  reference: number,
  fallback = 0
): number {
  if (value === undefined || value === "") {
    return fallback;
  }
  const number = Number.parseFloat(value);
  if (Number.isNaN(number)) {
    return fallback;
  }
  return value.trim().endsWith("%") ? (number / 100) * reference : number;
}

export function collectGradientColors(
  node: SvgNode,
  out: Map<string, string>
): Map<string, string> {
  if (
    (node.name === "linearGradient" || node.name === "radialGradient") &&
    node.attrs.id
  ) {
    const stop = node.children.find((child) => child.name === "stop");
    const color = stop && (readStyle(stop, "stop-color") ?? "#000000");
    if (color) {
      out.set(node.attrs.id, color);
    }
  }
  for (const child of node.children) {
    collectGradientColors(child, out);
  }
  return out;
}

export function collectImageHrefs(
  node: SvgNode,
  out: Set<string>
): Set<string> {
  if (node.name === "image") {
    const href = node.attrs.href ?? node.attrs["xlink:href"];
    if (href) {
      out.add(href);
    }
  }
  for (const child of node.children) {
    collectImageHrefs(child, out);
  }
  return out;
}

export function imageFormat(href: string): "PNG" | "JPEG" | null {
  if (/^data:image\/png[;,]/i.test(href)) {
    return "PNG";
  }
  if (/^data:image\/jpe?g[;,]/i.test(href)) {
    return "JPEG";
  }
  return null;
}

/** Converts logos jsPDF can't embed (SVG, WebP, URLs) to PNG in the browser. */
export async function rasterizeImage(href: string): Promise<string | null> {
  if (typeof document === "undefined" || typeof Image === "undefined") {
    return null;
  }
  return await new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const longest = Math.max(
        img.naturalWidth || 512,
        img.naturalHeight || 512
      );
      const scale = Math.min(1024 / longest, 4);
      canvas.width = Math.round((img.naturalWidth || 512) * scale);
      canvas.height = Math.round((img.naturalHeight || 512) * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      try {
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = href;
  });
}

/** `<clipPath>` elements by id, anywhere in the tree. */
function collectClipPaths(
  node: SvgNode,
  out: Map<string, SvgNode>
): Map<string, SvgNode> {
  if (node.name === "clipPath" && node.attrs.id) {
    out.set(node.attrs.id, node);
  }
  for (const child of node.children) {
    collectClipPaths(child, out);
  }
  return out;
}

/** `<pattern>` elements by id, anywhere in the tree. */
function collectPatterns(
  node: SvgNode,
  out: Map<string, SvgNode>
): Map<string, SvgNode> {
  if (node.name === "pattern" && node.attrs.id) {
    out.set(node.attrs.id, node);
  }
  for (const child of node.children) {
    collectPatterns(child, out);
  }
  return out;
}

/** Outline of one clip-path child, in its own user space. */
function clipShapeSegments(
  node: SvgNode,
  viewport: [number, number]
): Segment[] {
  const [vw, vh] = viewport;
  const attr = (name: string, reference: number) =>
    length(node.attrs[name], reference);
  switch (node.name) {
    case "path":
      return parsePathData(node.attrs.d ?? "");
    case "rect": {
      const rx = node.attrs.rx ?? node.attrs.ry;
      const ry = node.attrs.ry ?? node.attrs.rx;
      return rectSegments(
        attr("x", vw),
        attr("y", vh),
        attr("width", vw),
        attr("height", vh),
        length(rx, vw),
        length(ry, vh)
      );
    }
    case "circle": {
      const r = attr("r", Math.hypot(vw, vh) / Math.SQRT2);
      return ellipseSegments(attr("cx", vw), attr("cy", vh), r, r);
    }
    case "ellipse":
      return ellipseSegments(
        attr("cx", vw),
        attr("cy", vh),
        attr("rx", vw),
        attr("ry", vh)
      );
    default:
      return [];
  }
}

export abstract class SvgPainter {
  protected readonly gradients: Map<string, string>;
  /** Gradients the backend shades natively (see `resolveFill`) */
  protected readonly shadings: Map<string, SvgGradient> | null;
  /** `<clipPath>`s of the document being walked (collected at its root) */
  private clipPaths = new Map<string, SvgNode>();
  /** `<pattern>`s of the document being walked (collected at its root) */
  private patterns = new Map<string, SvgNode>();
  /**
   * Opaque color see-through paint is flattened over where a backend can't
   * blend (PostScript; a PDF gradient whose stops differ in alpha; a PDF
   * angular fan): the code's background on paper. The background itself
   * (the shape marked `data-qrdx-bg`) is flattened over `paper`. Exporters
   * set both from the props.
   */
  backdrop: RGBAColor = WHITE;
  paper: RGBAColor = WHITE;
  /** True while painting the background shape (and its pattern) */
  protected onPaper = false;
  /** True while painting an angular gradient's wedge fan */
  protected inConic = false;

  /**
   * `gradients` maps gradient ids to the color they flatten to. Pass
   * `shadings` (from `collectGradients`) when the backend can shade them.
   */
  constructor(
    gradients: Map<string, string>,
    shadings: Map<string, SvgGradient> | null = null
  ) {
    this.gradients = gradients;
    this.shadings = shadings;
  }

  resolveColor(value: string | undefined): PaintColor {
    if (!value || value === "none") {
      return null;
    }
    const reference = URL_REFERENCE.exec(value);
    if (reference) {
      // Gradients are flattened to their first stop; patterns are skipped.
      return this.resolveColor(this.gradients.get(reference[1] as string));
    }
    const color = parseColor(value === "currentColor" ? "#000000" : value);
    return color && color.a > 0 ? color : null;
  }

  /** The gradient a `url(#id)` paint shades natively, if any. */
  shadedGradient(value: string | undefined): SvgGradient | undefined {
    const id = value ? URL_REFERENCE.exec(value)?.[1] : undefined;
    return id ? this.shadings?.get(id) : undefined;
  }

  /**
   * Resolves a fill for these segments: a gradient this painter shades is
   * placed on the shape (or becomes the solid color SVG paints for a
   * degenerate gradient), a userSpaceOnUse pattern is returned to paint
   * inside the shape, and anything else goes through `resolveColor`.
   * `alpha` (fill-opacity times opacity) is folded into solid colors and
   * returned alongside gradients and patterns.
   */
  resolveFill(
    value: string | undefined,
    segments: Segment[],
    viewport: [number, number],
    alpha = 1
  ): FillPaint | null {
    if (alpha <= 0) {
      return null;
    }
    const pattern = this.patternOf(value);
    if (pattern) {
      return { pattern, alpha };
    }
    const gradient = this.shadedGradient(value);
    if (gradient) {
      const placed = placeGradient(gradient, segments, viewport);
      if (!placed) {
        return null;
      }
      if ("coords" in placed) {
        return { gradient: placed, alpha };
      }
      const color = { ...placed, a: placed.a * alpha };
      return color.a > 0 ? { color } : null;
    }
    const color = this.resolveColor(value);
    if (!color) {
      return null;
    }
    const withAlpha = { ...color, a: color.a * alpha };
    return withAlpha.a > 0 ? { color: withAlpha } : null;
  }

  /** The userSpaceOnUse `<pattern>` a `url(#id)` paint points to, if any. */
  patternOf(value: string | undefined): SvgNode | undefined {
    const id = value ? URL_REFERENCE.exec(value)?.[1] : undefined;
    const pattern = id ? this.patterns.get(id) : undefined;
    if (
      pattern?.attrs.patternUnits !== "userSpaceOnUse" ||
      (pattern.attrs.patternContentUnits ?? "userSpaceOnUse") !==
        "userSpaceOnUse" ||
      pattern.attrs.viewBox
    ) {
      return undefined;
    }
    return pattern;
  }

  /**
   * `color` made opaque for a backend without transparency: over paper
   * while painting the background, over the backdrop otherwise.
   */
  flatten(color: RGBAColor): RGBAColor {
    if (color.a >= 1) {
      return color;
    }
    return flattenOver(color, this.onPaper ? this.paper : this.backdrop);
  }

  /**
   * Paints a pattern's content inside `segments` (the shape, in the user
   * space of `state`): clip to the shape, then walk the tiles that meet it.
   * The tile at (x, y) holds the content with its origin at the tile's
   * corner, and content past a tile is cut off when there is more than one.
   * A pattern marked `data-qrdx-conic` (an angular gradient's wedge fan)
   * only walks the wedges whose `data-arc` meets the shape.
   * Returns false when this backend can't clip (nothing is painted).
   */
  paintPattern(
    segments: Segment[],
    state: PaintState,
    pattern: SvgNode,
    alpha: number
  ): boolean {
    const box = boundingBox(segments);
    if (!box || box.width <= 0 || box.height <= 0) {
      return true;
    }
    const [vw, vh] = state.viewport;
    const tileX = length(pattern.attrs.x, vw);
    const tileY = length(pattern.attrs.y, vh);
    const tileWidth = length(pattern.attrs.width, vw);
    const tileHeight = length(pattern.attrs.height, vh);
    if (!(tileWidth > 0 && tileHeight > 0)) {
      return true;
    }
    const transform = parseTransform(pattern.attrs.patternTransform);
    const inverse = invertMatrix(transform);
    if (!inverse) {
      return true;
    }
    if (!this.beginClip(segments, state.matrix, state.fillRule === "evenodd")) {
      return false;
    }
    const wasConic = this.inConic;
    this.inConic = pattern.attrs["data-qrdx-conic"] !== undefined;
    try {
      // The shape's box in pattern space (before patternTransform)
      const corners = [
        applyMatrix(inverse, box.x, box.y),
        applyMatrix(inverse, box.x + box.width, box.y),
        applyMatrix(inverse, box.x, box.y + box.height),
        applyMatrix(inverse, box.x + box.width, box.y + box.height),
      ];
      const xs = corners.map(([x]) => x);
      const ys = corners.map(([, y]) => y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const firstColumn = Math.floor((minX - tileX) / tileWidth);
      const lastColumn = Math.ceil((maxX - tileX) / tileWidth) - 1;
      const firstRow = Math.floor((minY - tileY) / tileHeight);
      const lastRow = Math.ceil((maxY - tileY) / tileHeight) - 1;
      const tiles = (lastColumn - firstColumn + 1) * (lastRow - firstRow + 1);
      if (tiles > 4096) {
        return true;
      }
      const conic = (pattern.attrs["data-qrdx-conic"] ?? "")
        .trim()
        .split(/\s+/)
        .map(Number);
      const base = multiply(state.matrix, transform);
      for (let row = firstRow; row <= lastRow; row++) {
        for (let column = firstColumn; column <= lastColumn; column++) {
          const originX = tileX + column * tileWidth;
          const originY = tileY + row * tileHeight;
          const matrix = multiply(base, [1, 0, 0, 1, originX, originY]);
          const contentBox = {
            x: minX - originX,
            y: minY - originY,
            width: maxX - minX,
            height: maxY - minY,
          };
          const span =
            conic.length === 2 && conic.every(Number.isFinite)
              ? angularSpan(conic[0] as number, conic[1] as number, contentBox)
              : null;
          const clipped =
            tiles > 1 &&
            this.beginClip(
              [
                { op: "M", x: 0, y: 0 },
                { op: "L", x: tileWidth, y: 0 },
                { op: "L", x: tileWidth, y: tileHeight },
                { op: "L", x: 0, y: tileHeight },
                { op: "Z" },
              ],
              matrix,
              false
            );
          try {
            const contentState: PaintState = {
              matrix,
              viewport: state.viewport,
              fill: "#000000",
              fillRule: "nonzero",
              stroke: "none",
              strokeWidth: 1,
              fontSize: 16,
              fontWeight: "normal",
              textAnchor: "start",
              fillOpacity: 1,
              opacity: alpha,
            };
            // A fan with one alpha sits in a <g opacity>: look inside it
            const visit = (children: SvgNode[], parent: PaintState) => {
              for (const child of children) {
                if (child.name === "g" && !child.attrs.transform) {
                  const own = Number.parseFloat(child.attrs.opacity ?? "1");
                  visit(child.children, {
                    ...parent,
                    opacity:
                      (parent.opacity ?? 1) * (Number.isFinite(own) ? own : 1),
                  });
                  continue;
                }
                if (span && child.attrs["data-arc"]) {
                  const [from, sweep] = child.attrs["data-arc"]
                    .split(/\s+/)
                    .map(Number) as [number, number];
                  if (!arcsOverlap([from, from + sweep], span)) {
                    continue;
                  }
                }
                this.walk(child, parent);
              }
            };
            visit(pattern.children, contentState);
          } finally {
            if (clipped) {
              this.endClip();
            }
          }
        }
      }
    } finally {
      this.inConic = wasConic;
      this.endClip();
    }
    return true;
  }

  /**
   * Paints the output rectangle `box` ([x0, y0, x1, y1] in output
   * coordinates) with a gradient `fill`, placed in the user space of `root`
   * as walked with `state`, so a background gradient continues into the
   * bleed. Returns false (painting nothing) when `fill` is not a gradient
   * this painter shades.
   */
  paintBleed(
    root: SvgNode,
    state: PaintState,
    fill: string,
    box: [number, number, number, number]
  ): boolean {
    if (!this.shadedGradient(fill)) {
      return false;
    }
    const [matrix, viewport] = this.viewportMatrix(
      { ...root, attrs: { ...root.attrs, x: "0", y: "0" } },
      {
        ...state,
        matrix: multiply(state.matrix, parseTransform(root.attrs.transform)),
      }
    );
    const inverse = invertMatrix(matrix);
    if (!inverse) {
      return false;
    }
    const [x0, y0, x1, y1] = box;
    const corners = [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ].map(([x, y]) => applyMatrix(inverse, x as number, y as number));
    const segments: Segment[] = corners.map(([x, y], index) => ({
      op: index === 0 ? "M" : "L",
      x,
      y,
    }));
    segments.push({ op: "Z" });
    this.paint(
      segments,
      { name: "rect", attrs: {}, children: [], text: "" },
      {
        ...state,
        matrix,
        viewport,
        fill,
        fillRule: "nonzero",
        stroke: "none",
      }
    );
    return true;
  }

  abstract paint(segments: Segment[], node: SvgNode, state: PaintState): void;

  abstract text(node: SvgNode, state: PaintState): void;

  abstract image(node: SvgNode, state: PaintState): void;

  /**
   * Restricts painting to `segments` (device space via `matrix`) until the
   * matching `endClip`. Backends that can't clip leave this as is, so they
   * paint the element unclipped.
   */
  beginClip(_segments: Segment[], _matrix: Matrix, _evenOdd: boolean): boolean {
    return false;
  }

  /** Ends the clip a `beginClip` that returned true started. */
  endClip(): void {
    // Nothing to undo when beginClip didn't clip
  }

  /**
   * The `clip-path="url(#id)"` outline of `node` (userSpaceOnUse: the
   * node's own user space), or null when it has none or it can't be found.
   */
  private clipOf(
    node: SvgNode,
    state: PaintState
  ): { segments: Segment[]; matrix: Matrix; evenOdd: boolean } | null {
    const reference = readStyle(node, "clip-path");
    const id = reference ? URL_REFERENCE.exec(reference)?.[1] : undefined;
    const clip = id ? this.clipPaths.get(id) : undefined;
    if (!clip) {
      return null;
    }
    const segments: Segment[] = [];
    let evenOdd = false;
    for (const child of clip.children) {
      const shape = clipShapeSegments(child, state.viewport);
      if (shape.length === 0) {
        continue;
      }
      const transform = parseTransform(child.attrs.transform);
      const isIdentity =
        transform[0] === 1 &&
        transform[1] === 0 &&
        transform[2] === 0 &&
        transform[3] === 1 &&
        transform[4] === 0 &&
        transform[5] === 0;
      segments.push(
        ...(isIdentity
          ? shape
          : shape.map((segment) => transformSegment(segment, transform)))
      );
      evenOdd ||= readStyle(child, "clip-rule") === "evenodd";
    }
    return segments.length > 0
      ? { segments, matrix: state.matrix, evenOdd }
      : null;
  }

  viewportMatrix(node: SvgNode, state: PaintState): [Matrix, [number, number]] {
    const x = length(node.attrs.x, state.viewport[0]);
    const y = length(node.attrs.y, state.viewport[1]);
    const width = length(
      node.attrs.width,
      state.viewport[0],
      state.viewport[0]
    );
    const height = length(
      node.attrs.height,
      state.viewport[1],
      state.viewport[1]
    );
    const viewBox = parseNumbers(node.attrs.viewBox);
    if (viewBox.length !== 4 || !(viewBox[2] && viewBox[3])) {
      return [multiply(state.matrix, [1, 0, 0, 1, x, y]), [width, height]];
    }
    const [vbX, vbY, vbWidth, vbHeight] = viewBox as [
      number,
      number,
      number,
      number,
    ];
    let scaleX = width / vbWidth;
    let scaleY = height / vbHeight;
    let offsetX = x;
    let offsetY = y;
    if ((node.attrs.preserveAspectRatio ?? "").trim() !== "none") {
      const uniform = node.attrs.preserveAspectRatio?.includes("slice")
        ? Math.max(scaleX, scaleY)
        : Math.min(scaleX, scaleY);
      offsetX += (width - vbWidth * uniform) / 2;
      offsetY += (height - vbHeight * uniform) / 2;
      scaleX = uniform;
      scaleY = uniform;
    }
    return [
      multiply(state.matrix, [
        scaleX,
        0,
        0,
        scaleY,
        offsetX - vbX * scaleX,
        offsetY - vbY * scaleY,
      ]),
      [vbWidth, vbHeight],
    ];
  }

  walk(node: SvgNode, parent: PaintState, isRoot = false) {
    if (isRoot) {
      this.clipPaths = collectClipPaths(node, new Map());
      this.patterns = collectPatterns(node, new Map());
    }
    if (SKIPPED_ELEMENTS.has(node.name)) {
      return;
    }
    if (
      readStyle(node, "display") === "none" ||
      readStyle(node, "visibility") === "hidden"
    ) {
      return;
    }

    let matrix = multiply(parent.matrix, parseTransform(node.attrs.transform));
    let viewport = parent.viewport;
    if (node.name === "svg") {
      const [viewportMatrix, size] = this.viewportMatrix(
        isRoot ? { ...node, attrs: { ...node.attrs, x: "0", y: "0" } } : node,
        { ...parent, matrix }
      );
      matrix = viewportMatrix;
      viewport = size;
    }

    const fontSize = readStyle(node, "font-size");
    const ownOpacity = Number.parseFloat(readStyle(node, "opacity") ?? "1");
    const ownFillOpacity = readStyle(node, "fill-opacity");
    const fillOpacity =
      ownFillOpacity === undefined
        ? (parent.fillOpacity ?? 1)
        : Number.parseFloat(ownFillOpacity);
    const state: PaintState = {
      fillOpacity: Number.isFinite(fillOpacity)
        ? Math.min(Math.max(fillOpacity, 0), 1)
        : 1,
      opacity:
        (parent.opacity ?? 1) *
        (Number.isFinite(ownOpacity)
          ? Math.min(Math.max(ownOpacity, 0), 1)
          : 1),
      matrix,
      viewport,
      fill: readStyle(node, "fill") ?? parent.fill,
      fillRule: readStyle(node, "fill-rule") ?? parent.fillRule,
      stroke: readStyle(node, "stroke") ?? parent.stroke,
      strokeWidth:
        readStyle(node, "stroke-width") === undefined
          ? parent.strokeWidth
          : length(readStyle(node, "stroke-width"), viewport[0], 1),
      fontSize:
        fontSize === undefined ? parent.fontSize : length(fontSize, 16, 16),
      fontWeight: readStyle(node, "font-weight") ?? parent.fontWeight,
      textAnchor: readStyle(node, "text-anchor") ?? parent.textAnchor,
    };
    // The code's background sits on paper (see `flatten`)
    const wasOnPaper = this.onPaper;
    if (node.attrs["data-qrdx-bg"] !== undefined) {
      this.onPaper = true;
    }
    try {
      // clip-path: paint the element inside the clip outline only
      const clip = node.attrs["clip-path"] ? this.clipOf(node, state) : null;
      if (clip && this.beginClip(clip.segments, clip.matrix, clip.evenOdd)) {
        try {
          this.paintNode(node, state);
        } finally {
          this.endClip();
        }
        return;
      }
      this.paintNode(node, state);
    } finally {
      this.onPaper = wasOnPaper;
    }
  }

  private paintNode(node: SvgNode, state: PaintState) {
    const [vw, vh] = state.viewport;
    const attr = (name: string, reference: number) =>
      length(node.attrs[name], reference);

    switch (node.name) {
      case "path":
        this.paint(parsePathData(node.attrs.d ?? ""), node, state);
        return;
      case "rect": {
        const rx = node.attrs.rx ?? node.attrs.ry;
        const ry = node.attrs.ry ?? node.attrs.rx;
        this.paint(
          rectSegments(
            attr("x", vw),
            attr("y", vh),
            attr("width", vw),
            attr("height", vh),
            length(rx, vw),
            length(ry, vh)
          ),
          node,
          state
        );
        return;
      }
      case "circle": {
        const r = attr("r", Math.hypot(vw, vh) / Math.SQRT2);
        this.paint(
          ellipseSegments(attr("cx", vw), attr("cy", vh), r, r),
          node,
          state
        );
        return;
      }
      case "ellipse":
        this.paint(
          ellipseSegments(
            attr("cx", vw),
            attr("cy", vh),
            attr("rx", vw),
            attr("ry", vh)
          ),
          node,
          state
        );
        return;
      case "line":
        this.paint(
          [
            { op: "M", x: attr("x1", vw), y: attr("y1", vh) },
            { op: "L", x: attr("x2", vw), y: attr("y2", vh) },
          ],
          node,
          { ...state, fill: "none" }
        );
        return;
      case "polygon":
      case "polyline": {
        const points = parseNumbers(node.attrs.points);
        const segments: Segment[] = [];
        for (let i = 0; i + 1 < points.length; i += 2) {
          segments.push({
            op: i === 0 ? "M" : "L",
            x: points[i] as number,
            y: points[i + 1] as number,
          });
        }
        if (node.name === "polygon" && segments.length > 0) {
          segments.push({ op: "Z" });
        }
        this.paint(segments, node, state);
        return;
      }
      case "text":
        this.text(node, state);
        return;
      case "image":
        this.image(node, state);
        return;
      default:
        for (const child of node.children) {
          this.walk(child, state);
        }
    }
  }
}
