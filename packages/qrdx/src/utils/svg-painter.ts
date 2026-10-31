/** biome-ignore-all lint/style/noMagicNumbers: SVG painting */
// Walks the SVG this library renders and hands vector shapes, text and images
// to an output backend (PDF via jsPDF, EPS as PostScript).
import { parseColor, type RGBAColor } from "./parse-color";
import {
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
}

export type PaintColor = RGBAColor | null;

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

export abstract class SvgPainter {
  protected readonly gradients: Map<string, string>;

  constructor(gradients: Map<string, string>) {
    this.gradients = gradients;
  }

  resolveColor(value: string | undefined): PaintColor {
    if (!value || value === "none") {
      return null;
    }
    const reference = /^url\(\s*#([^)\s]+)\s*\)/.exec(value);
    if (reference) {
      // Gradients are flattened to their first stop; patterns are skipped.
      return this.resolveColor(this.gradients.get(reference[1] as string));
    }
    const color = parseColor(value === "currentColor" ? "#000000" : value);
    return color && color.a > 0 ? color : null;
  }

  abstract paint(segments: Segment[], node: SvgNode, state: PaintState): void;

  abstract text(node: SvgNode, state: PaintState): void;

  abstract image(node: SvgNode, state: PaintState): void;

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
    const state: PaintState = {
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
    const [vw, vh] = viewport;
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
