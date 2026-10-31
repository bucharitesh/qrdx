/** biome-ignore-all lint/style/noMagicNumbers: rasterizer constants */
/** biome-ignore-all lint/suspicious/noBitwiseOperators: even-odd winding and PNG CRC */
// Test-only SVG rasterizer. Paints the SVG qrdx renders into an RGBA buffer
// that jsQR can decode, with no canvas package or browser.
//
// It reuses qrdx's own SVG tree walker (the one the PDF and EPS exporters use)
// and fills each shape with an anti-aliased scanline polygon filler. Supported:
// path/rect/circle/ellipse/polygon fills (nonzero + evenodd), strokes (butt
// caps, no joins), transforms, nested <svg> viewports, opacity, gradients
// flattened to their first stop, and SVG data-URI <image>s (other images are
// painted as an opaque grey block, like scan-score's own logo placeholder).
// Masks, clip paths, filters and text are not painted.

import jsQR from "jsqr";
import { parseColor, type RGBAColor } from "../../src/utils/parse-color";
import {
  applyMatrix,
  type Matrix,
  matrixScale,
  multiply,
  parseSvgMarkup,
  type Segment,
  type SvgNode,
} from "../../src/utils/svg-geometry";
import {
  collectGradientColors,
  length,
  type PaintState,
  readStyle,
  SvgPainter,
} from "../../src/utils/svg-painter";

export interface RasterImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

const SUBSAMPLES = 5;

type Point = [number, number];

export function createImage(
  width: number,
  height: number,
  background: string | null = "#ffffff"
): RasterImage {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const data = new Uint8ClampedArray(w * h * 4);
  const color = background ? parseColor(background) : null;
  if (color) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = color.r;
      data[i + 1] = color.g;
      data[i + 2] = color.b;
      data[i + 3] = Math.round(color.a * 255);
    }
  }
  return { data, width: w, height: h };
}

/** Flattens segments (already in device space) into closed polygons. */
function toPolygons(segments: Segment[], matrix: Matrix): Point[][] {
  const polygons: Point[][] = [];
  let current: Point[] = [];
  let start: Point = [0, 0];
  let last: Point = [0, 0];
  const flush = () => {
    if (current.length > 1) {
      polygons.push(current);
    }
    current = [];
  };
  for (const segment of segments) {
    if (segment.op === "M") {
      flush();
      start = applyMatrix(matrix, segment.x, segment.y);
      last = start;
      current.push(start);
    } else if (segment.op === "L") {
      last = applyMatrix(matrix, segment.x, segment.y);
      current.push(last);
    } else if (segment.op === "C") {
      const p0 = last;
      const p1 = applyMatrix(matrix, segment.x1, segment.y1);
      const p2 = applyMatrix(matrix, segment.x2, segment.y2);
      const p3 = applyMatrix(matrix, segment.x, segment.y);
      const estimate =
        Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) +
        Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) +
        Math.hypot(p3[0] - p2[0], p3[1] - p2[1]);
      const steps = Math.max(2, Math.min(64, Math.ceil(estimate / 1.5)));
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
      current.push(start);
      flush();
      current.push(start);
      last = start;
    }
  }
  flush();
  return polygons;
}

/** Anti-aliased polygon fill, composited source-over. */
export function fillPolygons(
  image: RasterImage,
  polygons: Point[][],
  color: RGBAColor,
  alpha: number,
  evenOdd = false
) {
  if (alpha <= 0 || polygons.length === 0) {
    return;
  }
  const edges: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    dir: number;
  }[] = [];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const polygon of polygons) {
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i] as Point;
      const b = polygon[(i + 1) % polygon.length] as Point;
      minX = Math.min(minX, a[0]);
      maxX = Math.max(maxX, a[0]);
      minY = Math.min(minY, a[1]);
      maxY = Math.max(maxY, a[1]);
      if (a[1] === b[1]) {
        continue;
      }
      edges.push(
        a[1] < b[1]
          ? { x0: a[0], y0: a[1], x1: b[0], y1: b[1], dir: 1 }
          : { x0: b[0], y0: b[1], x1: a[0], y1: a[1], dir: -1 }
      );
    }
  }
  const x0 = Math.max(0, Math.floor(minX));
  const x1 = Math.min(image.width, Math.ceil(maxX));
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(image.height, Math.ceil(maxY));
  if (x0 >= x1 || y0 >= y1) {
    return;
  }
  const coverage = new Float32Array(x1 - x0);
  const crossings: { x: number; dir: number }[] = [];
  const weight = 1 / SUBSAMPLES;

  const addSpan = (from: number, to: number) => {
    const a = Math.max(from, x0);
    const b = Math.min(to, x1);
    if (b <= a) {
      return;
    }
    const ia = Math.floor(a);
    const ib = Math.floor(b);
    if (ia === ib) {
      coverage[ia - x0] += (b - a) * weight;
      return;
    }
    coverage[ia - x0] += (ia + 1 - a) * weight;
    for (let i = ia + 1; i < ib; i++) {
      coverage[i - x0] += weight;
    }
    if (ib < x1) {
      coverage[ib - x0] += (b - ib) * weight;
    }
  };

  for (let py = y0; py < y1; py++) {
    coverage.fill(0);
    for (let s = 0; s < SUBSAMPLES; s++) {
      const sy = py + (s + 0.5) / SUBSAMPLES;
      crossings.length = 0;
      for (const edge of edges) {
        if (sy >= edge.y0 && sy < edge.y1) {
          crossings.push({
            x:
              edge.x0 +
              ((sy - edge.y0) * (edge.x1 - edge.x0)) / (edge.y1 - edge.y0),
            dir: edge.dir,
          });
        }
      }
      if (crossings.length < 2) {
        continue;
      }
      crossings.sort((a, b) => a.x - b.x);
      let winding = 0;
      for (let i = 0; i < crossings.length - 1; i++) {
        const crossing = crossings[i] as { x: number; dir: number };
        winding = evenOdd ? winding ^ 1 : winding + crossing.dir;
        if (winding !== 0) {
          addSpan(crossing.x, (crossings[i + 1] as { x: number }).x);
        }
      }
    }
    const row = py * image.width;
    for (let px = x0; px < x1; px++) {
      const c = Math.min(1, coverage[px - x0] as number) * alpha;
      if (c <= 0) {
        continue;
      }
      const i = (row + px) * 4;
      const { data } = image;
      const dstA = (data[i + 3] as number) / 255;
      const outA = c + dstA * (1 - c);
      for (let k = 0; k < 3; k++) {
        const src = k === 0 ? color.r : k === 1 ? color.g : color.b;
        data[i + k] =
          outA === 0
            ? 0
            : (src * c + (data[i + k] as number) * dstA * (1 - c)) / outA;
      }
      data[i + 3] = outA * 255;
    }
  }
}

/** Butt-capped stroke: one quad per flattened line piece. */
function strokePolylines(
  image: RasterImage,
  segments: Segment[],
  matrix: Matrix,
  width: number,
  color: RGBAColor,
  alpha: number
) {
  const half = (width * matrixScale(matrix)) / 2;
  if (half <= 0) {
    return;
  }
  const quads: Point[][] = [];
  for (const line of toPolygons(segments, matrix)) {
    for (let i = 0; i + 1 < line.length; i++) {
      const [ax, ay] = line[i] as Point;
      const [bx, by] = line[i + 1] as Point;
      const len = Math.hypot(bx - ax, by - ay);
      if (len === 0) {
        continue;
      }
      const nx = (-(by - ay) / len) * half;
      const ny = ((bx - ax) / len) * half;
      quads.push([
        [ax + nx, ay + ny],
        [bx + nx, by + ny],
        [bx - nx, by - ny],
        [ax - nx, ay - ny],
      ]);
    }
  }
  fillPolygons(image, quads, color, alpha);
}

const opacityOf = (node: SvgNode, name: string) => {
  const value = Number.parseFloat(readStyle(node, name) ?? "1");
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
};

const GREY: RGBAColor = { r: 128, g: 128, b: 128, a: 1 };

class RasterPainter extends SvgPainter {
  readonly target: RasterImage;
  /** Opacity inherited from ancestor groups */
  private readonly opacityStack: number[] = [1];

  constructor(target: RasterImage, gradients: Map<string, string>) {
    super(gradients);
    this.target = target;
  }

  override walk(node: SvgNode, parent: PaintState, isRoot = false) {
    const own = opacityOf(node, "opacity");
    const isContainer = node.name === "g" || node.name === "svg";
    if (isContainer) {
      this.opacityStack.push((this.opacityStack.at(-1) as number) * own);
    }
    super.walk(node, parent, isRoot);
    if (isContainer) {
      this.opacityStack.pop();
    }
  }

  private alpha(node: SvgNode, kind: "fill" | "stroke") {
    const inherited = this.opacityStack.at(-1) as number;
    const own =
      node.name === "g" || node.name === "svg" ? 1 : opacityOf(node, "opacity");
    return inherited * own * opacityOf(node, `${kind}-opacity`);
  }

  paint(segments: Segment[], node: SvgNode, state: PaintState): void {
    const fill = this.resolveColor(state.fill);
    if (fill) {
      fillPolygons(
        this.target,
        toPolygons(segments, state.matrix),
        fill,
        fill.a * this.alpha(node, "fill"),
        state.fillRule === "evenodd"
      );
    }
    const stroke = this.resolveColor(state.stroke);
    if (stroke && state.strokeWidth > 0) {
      strokePolylines(
        this.target,
        segments,
        state.matrix,
        state.strokeWidth,
        stroke,
        stroke.a * this.alpha(node, "stroke")
      );
    }
  }

  text(): void {
    // Frame labels sit outside the code; they don't affect decoding.
  }

  image(node: SvgNode, state: PaintState): void {
    const href = node.attrs.href ?? node.attrs["xlink:href"] ?? "";
    const [vw, vh] = state.viewport;
    const x = length(node.attrs.x, vw);
    const y = length(node.attrs.y, vh);
    const width = length(node.attrs.width, vw);
    const height = length(node.attrs.height, vh);
    if (!(width > 0 && height > 0)) {
      return;
    }
    const nested = svgFromDataUri(href);
    if (nested) {
      collectGradientColors(nested, this.gradients);
      super.walk(
        {
          ...nested,
          attrs: {
            ...nested.attrs,
            x: String(x),
            y: String(y),
            width: String(width),
            height: String(height),
            preserveAspectRatio:
              node.attrs.preserveAspectRatio ??
              nested.attrs.preserveAspectRatio ??
              "xMidYMid meet",
          },
        },
        state
      );
      return;
    }
    const corners: Point[] = [
      applyMatrix(state.matrix, x, y),
      applyMatrix(state.matrix, x + width, y),
      applyMatrix(state.matrix, x + width, y + height),
      applyMatrix(state.matrix, x, y + height),
    ];
    fillPolygons(this.target, [corners], GREY, this.alpha(node, "fill"));
  }
}

export function svgFromDataUri(href: string): SvgNode | null {
  const match = /^data:image\/svg\+xml(;base64)?(?:;[^,]*)?,(.*)$/is.exec(href);
  if (!match) {
    return null;
  }
  const body = match[1]
    ? Buffer.from(match[2] as string, "base64").toString("utf8")
    : decodeURIComponent(match[2] as string);
  return parseSvgMarkup(body);
}

export interface RenderOptions {
  /** Output width of the SVG artwork in pixels (default: its own width) */
  width?: number;
  /** Extra border around the artwork, in pixels */
  pad?: number;
  /** Page color behind the artwork (default white) */
  background?: string | null;
}

/** Rasterizes SVG markup (or a parsed root) into an RGBA image. */
export function rasterizeSvg(
  svg: string | SvgNode,
  options: RenderOptions = {}
): RasterImage {
  const root = typeof svg === "string" ? parseSvgMarkup(svg) : svg;
  if (!root) {
    throw new Error("Not an SVG document");
  }
  const rootWidth = length(root.attrs.width, 0, 0) || 512;
  const rootHeight = length(root.attrs.height, 0, 0) || rootWidth;
  const width = options.width ?? rootWidth;
  const scale = width / rootWidth;
  const pad = options.pad ?? 0;
  const image = createImage(
    width + 2 * pad,
    rootHeight * scale + 2 * pad,
    options.background === undefined ? "#ffffff" : options.background
  );
  drawSvg(image, root, pad, pad, width, rootHeight * scale);
  return image;
}

/** Draws an SVG root into `image` at (x, y) with the given size. */
export function drawSvg(
  image: RasterImage,
  root: SvgNode,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const rootWidth = length(root.attrs.width, 0, 0) || width;
  const rootHeight = length(root.attrs.height, 0, 0) || height;
  const painter = new RasterPainter(
    image,
    collectGradientColors(root, new Map())
  );
  painter.walk(
    root,
    {
      matrix: multiply(
        [1, 0, 0, 1, x, y],
        [width / rootWidth, 0, 0, height / rootHeight, 0, 0]
      ),
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
}

/** Decodes the QR code in an image; returns the UTF-8 text or null. */
export function decodeQR(image: RasterImage): string | null {
  const result = jsQR(image.data, image.width, image.height, {
    inversionAttempts: "attemptBoth",
  });
  if (!result) {
    return null;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from(result.binaryData)
    );
  } catch {
    return result.data;
  }
}

/** PNG bytes of an image (for debugging failed decodes). */
export async function toPng(image: RasterImage): Promise<Uint8Array> {
  const { deflateSync } = await import("node:zlib");
  const { width, height, data } = image;
  const raw = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw.set(
      data.subarray(y * width * 4, (y + 1) * width * 4),
      y * (width * 4 + 1) + 1
    );
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xed_b8_83_20 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (bytes: Uint8Array) => {
    let c = 0xff_ff_ff_ff;
    for (const b of bytes) c = (crcTable[(c ^ b) & 0xff] as number) ^ (c >>> 8);
    return (c ^ 0xff_ff_ff_ff) >>> 0;
  };
  const chunk = (type: string, body: Uint8Array) => {
    const out = new Uint8Array(12 + body.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, body.length);
    out.set(new TextEncoder().encode(type), 4);
    out.set(body, 8);
    view.setUint32(8 + body.length, crc(out.subarray(4, 8 + body.length)));
    return out;
  };
  const header = new Uint8Array(13);
  const hv = new DataView(header.buffer);
  hv.setUint32(0, width);
  hv.setUint32(4, height);
  header.set([8, 6, 0, 0, 0], 8);
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", new Uint8Array(deflateSync(raw))),
    chunk("IEND", new Uint8Array()),
  ];
  const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    png.set(p, offset);
    offset += p.length;
  }
  return png;
}

/**
 * Camera-like capture: contrast loss and a blur of about a quarter module
 * (two box-blur passes ≈ Gaussian), as phone cameras deliver frames. Returns
 * a new image.
 */
export function simulateCamera(
  source: RasterImage,
  modulePx: number,
  contrast = 0.75
): RasterImage {
  const { width, height } = source;
  // jsQR reads luminance only, and blur and contrast are linear, so working on
  // one grey channel gives the decoder the same input three times faster.
  let grey = new Float32Array(width * height);
  for (let i = 0; i < grey.length; i++) {
    const p = i * 4;
    const luma =
      0.2126 * (source.data[p] as number) +
      0.7152 * (source.data[p + 1] as number) +
      0.0722 * (source.data[p + 2] as number);
    grey[i] = 128 + (luma - 128) * contrast;
  }
  const radius = Math.max(1, Math.round(modulePx * 0.25));
  const window = 2 * radius + 1;
  let next = new Float32Array(width * height);
  const blur = (horizontal: boolean) => {
    const lines = horizontal ? height : width;
    const span = horizontal ? width : height;
    const stride = horizontal ? 1 : width;
    for (let line = 0; line < lines; line++) {
      const start = horizontal ? line * width : line;
      const at = (position: number) =>
        grey[
          start + Math.min(Math.max(position, 0), span - 1) * stride
        ] as number;
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += at(k);
      for (let p = 0; p < span; p++) {
        next[start + p * stride] = sum / window;
        sum += at(p + radius + 1) - at(p - radius);
      }
    }
    [grey, next] = [next, grey];
  };
  for (let pass = 0; pass < 2; pass++) {
    blur(true);
    blur(false);
  }
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < grey.length; i++) {
    const value = grey[i] as number;
    data[i * 4] = value;
    data[i * 4 + 1] = value;
    data[i * 4 + 2] = value;
    data[i * 4 + 3] = 255;
  }
  return { data, width, height };
}
