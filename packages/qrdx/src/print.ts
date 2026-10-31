/** biome-ignore-all lint/style/noMagicNumbers: print measurements */
import type { jsPDF as JsPDF } from "jspdf";
import type { QRProps } from "../types";
import qrcodegen from "./codegen";
import {
  DEFAULT_BGCOLOR,
  DEFAULT_LEVEL,
  DEFAULT_MARGIN,
  DEFAULT_SIZE,
  ERROR_LEVEL_MAP,
} from "./constants";
import { downloadFile, withQRSize } from "./download";
import { getFrameLayout, isFrameActive } from "./frame";
import { getQRAsSVGDataUri } from "./index";
import { getSolidColor } from "./utils/color";
import { parseColor, type RGBAColor, rgbToCmyk } from "./utils/parse-color";
import {
  applyMatrix,
  ellipseSegments,
  type Matrix,
  matrixScale,
  multiply,
  parseNumbers,
  parsePathData,
  parseSvgMarkup,
  parseTransform,
  rectSegments,
  type Segment,
  type SvgNode,
} from "./utils/svg-geometry";

export { type RGBAColor, rgbToCmyk } from "./utils/parse-color";

export type PrintUnit = "mm" | "in";
export type PrintColorMode = "rgb" | "cmyk";

export interface PrintOptions {
  /** Width of the QR code itself, in `unit`. A frame adds to the printed size. */
  size: number;
  /** Unit for `size` (default "mm") */
  unit?: PrintUnit;
  /** Bleed on every side, in millimetres (0 by default; 3 is typical) */
  bleed?: number;
  /** Draw crop marks outside the bleed (default false) */
  cropMarks?: boolean;
  /** "cmyk" writes naive CMYK colors, see `rgbToCmyk` (default "rgb") */
  colorMode?: PrintColorMode;
}

/** Physical layout of a print file. All lengths are in millimetres. */
export interface PrintLayout {
  /** Width of the QR code, quiet zone (margin) included */
  codeWidth: number;
  /** Finished (trimmed) artwork size, frame included */
  trimWidth: number;
  trimHeight: number;
  bleed: number;
  /** Page size: trim + bleed (+ room for crop marks) */
  pageWidth: number;
  pageHeight: number;
  /** Top-left corner of the trim box on the page */
  trimX: number;
  trimY: number;
  /** Width of one QR module */
  moduleSize: number;
  /** Modules across the code, margin included */
  moduleCount: number;
  /** Rule of thumb: a code scans from about 10× its width */
  maxScanDistance: number;
}

const MM_PER_INCH = 25.4;
const MIN_PRINT_SIZE_MM = 5;
const MAX_PRINT_SIZE_MM = 2000;
// Logical render size; print output is scaled from this.
const RENDER_SIZE = 1000;
const CROP_MARK_LENGTH = 5;
const CROP_MARK_GAP = 2;
const CROP_MARK_WIDTH = 0.25 * (MM_PER_INCH / 72); // 0.25pt hairline

function toMillimetres(value: number, unit: PrintUnit = "mm"): number {
  return unit === "in" ? value * MM_PER_INCH : value;
}

/** Modules across the code for these props, margin included. */
export function getQRModuleCount(props: QRProps): number {
  const level = props.level ?? DEFAULT_LEVEL;
  const margin = props.margin ?? DEFAULT_MARGIN;
  return (
    qrcodegen.QrCode.encodeText(props.value, ERROR_LEVEL_MAP[level]).size +
    margin * 2
  );
}

/**
 * Computes the physical size of a print file (no rendering). Throws when the
 * size is out of range (5 mm to 2 m).
 */
export function getPrintLayout(
  props: QRProps,
  options: PrintOptions
): PrintLayout {
  const codeWidth = toMillimetres(options.size, options.unit);
  if (
    !Number.isFinite(codeWidth) ||
    codeWidth < MIN_PRINT_SIZE_MM ||
    codeWidth > MAX_PRINT_SIZE_MM
  ) {
    throw new Error(
      `Print size must be between ${MIN_PRINT_SIZE_MM} mm and ${MAX_PRINT_SIZE_MM / 1000} m`
    );
  }
  const bleed = Math.min(Math.max(options.bleed ?? 0, 0), 20);
  const scale = codeWidth / RENDER_SIZE;
  const frame = isFrameActive(props.frame)
    ? getFrameLayout(RENDER_SIZE, props.frame)
    : null;
  const trimWidth = (frame?.width ?? RENDER_SIZE) * scale;
  const trimHeight = (frame?.height ?? RENDER_SIZE) * scale;
  const slug = options.cropMarks
    ? bleed + CROP_MARK_GAP + CROP_MARK_LENGTH + 1
    : bleed;
  const moduleCount = getQRModuleCount(props);

  return {
    codeWidth,
    trimWidth,
    trimHeight,
    bleed,
    pageWidth: trimWidth + 2 * slug,
    pageHeight: trimHeight + 2 * slug,
    trimX: slug,
    trimY: slug,
    moduleSize: codeWidth / moduleCount,
    moduleCount,
    maxScanDistance: codeWidth * 10,
  };
}

async function renderPrintSVG(props: QRProps): Promise<string> {
  const dataUri = await getQRAsSVGDataUri(
    withQRSize({ ...props, size: props.size ?? DEFAULT_SIZE }, RENDER_SIZE)
  );
  return decodeURIComponent(dataUri.replace("data:image/svg+xml,", ""));
}

// ── SVG → jsPDF ────────────────────────────────────────────────────────────

interface PaintState {
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

type PaintColor = RGBAColor | null;

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

function readStyle(node: SvgNode, name: string): string | undefined {
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

function length(
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

function collectGradientColors(
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

function collectImageHrefs(node: SvgNode, out: Set<string>): Set<string> {
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

function imageFormat(href: string): "PNG" | "JPEG" | null {
  if (/^data:image\/png[;,]/i.test(href)) {
    return "PNG";
  }
  if (/^data:image\/jpe?g[;,]/i.test(href)) {
    return "JPEG";
  }
  return null;
}

/** Converts logos jsPDF can't embed (SVG, WebP, URLs) to PNG in the browser. */
async function rasterizeImage(href: string): Promise<string | null> {
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

class PdfPainter {
  private readonly pdf: JsPDF;
  private readonly cmyk: boolean;
  private readonly gradients: Map<string, string>;
  private readonly images: Map<string, string>;

  constructor(
    pdf: JsPDF,
    cmyk: boolean,
    gradients: Map<string, string>,
    images: Map<string, string>
  ) {
    this.pdf = pdf;
    this.cmyk = cmyk;
    this.gradients = gradients;
    this.images = images;
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

  setColor(kind: "fill" | "draw" | "text", color: RGBAColor) {
    const set =
      kind === "fill"
        ? this.pdf.setFillColor.bind(this.pdf)
        : kind === "draw"
          ? this.pdf.setDrawColor.bind(this.pdf)
          : this.pdf.setTextColor.bind(this.pdf);
    if (this.cmyk) {
      const [c, m, y, k] = rgbToCmyk(color.r, color.g, color.b);
      set(c, m, y, k);
    } else {
      set(Math.round(color.r), Math.round(color.g), Math.round(color.b));
    }
  }

  setRegistrationColor() {
    if (this.cmyk) {
      this.pdf.setDrawColor(1, 1, 1, 1);
    } else {
      this.pdf.setDrawColor(0, 0, 0);
    }
  }

  tracePath(segments: Segment[], matrix: Matrix) {
    let open = false;
    for (const segment of segments) {
      if (segment.op === "M") {
        const [x, y] = applyMatrix(matrix, segment.x, segment.y);
        this.pdf.moveTo(x, y);
        open = true;
      } else if (segment.op === "L") {
        const [x, y] = applyMatrix(matrix, segment.x, segment.y);
        if (open) {
          this.pdf.lineTo(x, y);
        } else {
          this.pdf.moveTo(x, y);
          open = true;
        }
      } else if (segment.op === "C") {
        const [x1, y1] = applyMatrix(matrix, segment.x1, segment.y1);
        const [x2, y2] = applyMatrix(matrix, segment.x2, segment.y2);
        const [x, y] = applyMatrix(matrix, segment.x, segment.y);
        this.pdf.curveTo(x1, y1, x2, y2, x, y);
      } else if (open) {
        this.pdf.close();
      }
    }
  }

  paint(segments: Segment[], node: SvgNode, state: PaintState) {
    if (segments.length === 0) {
      return;
    }
    const opacity = Number.parseFloat(readStyle(node, "opacity") ?? "1");
    const fillOpacity = Number.parseFloat(
      readStyle(node, "fill-opacity") ?? "1"
    );
    if (opacity === 0) {
      return;
    }
    const fill = fillOpacity === 0 ? null : this.resolveColor(state.fill);
    const stroke =
      state.strokeWidth > 0 ? this.resolveColor(state.stroke) : null;
    if (!(fill || stroke)) {
      return;
    }
    const evenOdd = state.fillRule === "evenodd";

    if (fill) {
      this.setColor("fill", fill);
    }
    if (stroke) {
      this.setColor("draw", stroke);
      this.pdf.setLineWidth(state.strokeWidth * matrixScale(state.matrix));
    }
    this.tracePath(segments, state.matrix);
    if (fill && stroke) {
      if (evenOdd) {
        this.pdf.fillStrokeEvenOdd();
      } else {
        this.pdf.fillStroke();
      }
    } else if (fill) {
      if (evenOdd) {
        this.pdf.fillEvenOdd();
      } else {
        this.pdf.fill();
      }
    } else {
      this.pdf.stroke();
    }
  }

  text(node: SvgNode, state: PaintState) {
    const content = node.text.replace(/\s+/g, " ").trim();
    const color = this.resolveColor(state.fill);
    if (!(content && color)) {
      return;
    }
    const scale = matrixScale(state.matrix);
    const [x, y] = applyMatrix(
      state.matrix,
      length(node.attrs.x, state.viewport[0]),
      length(node.attrs.y, state.viewport[1])
    );
    const bold =
      state.fontWeight === "bold" ||
      Number.parseInt(state.fontWeight, 10) >= 600;
    this.pdf.setFont("helvetica", bold ? "bold" : "normal");
    // jsPDF font sizes are in points; the artwork is in millimetres.
    let fontSize = state.fontSize * scale * (72 / MM_PER_INCH);
    this.pdf.setFontSize(fontSize);
    const maxWidth = Number.parseFloat(node.attrs["data-max-width"] ?? "");
    if (maxWidth > 0) {
      const fitWidth = maxWidth * scale;
      const width = this.pdf.getTextWidth(content);
      if (width > fitWidth) {
        fontSize *= fitWidth / width;
        this.pdf.setFontSize(fontSize);
      }
    }
    this.setColor("text", color);
    const align =
      state.textAnchor === "middle"
        ? "center"
        : state.textAnchor === "end"
          ? "right"
          : "left";
    this.pdf.text(content, x, y, { align, baseline: "alphabetic" });
  }

  image(node: SvgNode, state: PaintState) {
    const href = node.attrs.href ?? node.attrs["xlink:href"];
    const source = href && (imageFormat(href) ? href : this.images.get(href));
    const format = source && imageFormat(source);
    if (!(source && format)) {
      return;
    }
    const x = length(node.attrs.x, state.viewport[0]);
    const y = length(node.attrs.y, state.viewport[1]);
    const width = length(node.attrs.width, state.viewport[0]);
    const height = length(node.attrs.height, state.viewport[1]);
    if (width <= 0 || height <= 0) {
      return;
    }
    const [x0, y0] = applyMatrix(state.matrix, x, y);
    const [x1, y1] = applyMatrix(state.matrix, x + width, y + height);
    this.pdf.addImage(
      source,
      format,
      Math.min(x0, x1),
      Math.min(y0, y1),
      Math.abs(x1 - x0),
      Math.abs(y1 - y0)
    );
  }

  /** Matrix that maps a nested <svg> viewport onto its parent. */
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

function drawCropMarks(pdf: JsPDF, painter: PdfPainter, layout: PrintLayout) {
  const { trimX, trimY, trimWidth, trimHeight, bleed } = layout;
  const offset = bleed + CROP_MARK_GAP;
  const left = trimX;
  const right = trimX + trimWidth;
  const top = trimY;
  const bottom = trimY + trimHeight;
  painter.setRegistrationColor();
  pdf.setLineWidth(CROP_MARK_WIDTH);
  for (const x of [left, right]) {
    const outward = x === left ? -1 : 1;
    for (const y of [top, bottom]) {
      const vertical = y === top ? -1 : 1;
      // Horizontal mark beside the corner
      pdf.line(
        x + outward * offset,
        y,
        x + outward * (offset + CROP_MARK_LENGTH),
        y
      );
      // Vertical mark above/below the corner
      pdf.line(
        x,
        y + vertical * offset,
        x,
        y + vertical * (offset + CROP_MARK_LENGTH)
      );
    }
  }
}

/** Color the bleed area is filled with, if any. */
function getBleedColor(props: QRProps): string | null {
  if (isFrameActive(props.frame)) {
    const frame = getFrameLayout(RENDER_SIZE, props.frame);
    return frame.squareEdges ? frame.color : null;
  }
  return getSolidColor(props.bgColor, DEFAULT_BGCOLOR);
}

/**
 * Renders a print-ready vector PDF: modules, eyes and frame are vector paths
 * (logos stay raster images) at the exact physical size, with optional bleed
 * and crop marks. In "cmyk" mode colors are converted with `rgbToCmyk`.
 * Gradients are flattened to their first color stop. Frame text uses
 * Helvetica Bold, so characters outside Latin-1 may not render.
 *
 * Returns a `data:application/pdf` URL. Needs the optional `jspdf` package.
 */
export async function getQRAsPrintPDF(
  props: QRProps,
  options: PrintOptions
): Promise<string> {
  const pdf = await createPrintPDF(props, options);
  return pdf.output("dataurlstring");
}

/** Same as `getQRAsPrintPDF`, but returns the PDF as an ArrayBuffer. */
export async function getQRAsPrintPDFBuffer(
  props: QRProps,
  options: PrintOptions
): Promise<ArrayBuffer> {
  const pdf = await createPrintPDF(props, options);
  return pdf.output("arraybuffer");
}

async function createPrintPDF(
  props: QRProps,
  options: PrintOptions
): Promise<JsPDF> {
  const layout = getPrintLayout(props, options);

  let jsPDF: typeof import("jspdf").jsPDF;
  try {
    ({ jsPDF } = await import("jspdf"));
  } catch (error) {
    throw new Error(
      `PDF export needs the optional "jspdf" package. Install it with \`npm install jspdf\`. (${error})`
    );
  }

  const markup = await renderPrintSVG(props);
  const root = parseSvgMarkup(markup);
  if (!root) {
    throw new Error("Failed to render the QR code for printing");
  }

  const images = new Map<string, string>();
  for (const href of collectImageHrefs(root, new Set())) {
    if (!imageFormat(href)) {
      const png = await rasterizeImage(href);
      if (png) {
        images.set(href, png);
      }
    }
  }

  const pdf = new jsPDF({
    orientation:
      layout.pageWidth > layout.pageHeight ? "landscape" : "portrait",
    unit: "mm",
    format: [layout.pageWidth, layout.pageHeight],
    compress: true,
  });
  pdf.setProperties({ title: "QR code", creator: "qrdx" });

  const painter = new PdfPainter(
    pdf,
    options.colorMode === "cmyk",
    collectGradientColors(root, new Map()),
    images
  );

  // Extend the edge color into the bleed so trimming leaves no white sliver.
  const bleedColor =
    layout.bleed > 0
      ? painter.resolveColor(getBleedColor(props) ?? undefined)
      : null;
  if (bleedColor) {
    painter.setColor("fill", bleedColor);
    pdf.rect(
      layout.trimX - layout.bleed,
      layout.trimY - layout.bleed,
      layout.trimWidth + 2 * layout.bleed,
      layout.trimHeight + 2 * layout.bleed,
      "F"
    );
  }

  const scale = layout.codeWidth / RENDER_SIZE;
  const rootWidth = length(root.attrs.width, RENDER_SIZE, RENDER_SIZE);
  const rootHeight = length(root.attrs.height, RENDER_SIZE, RENDER_SIZE);
  painter.walk(
    root,
    {
      matrix: multiply(
        [1, 0, 0, 1, layout.trimX, layout.trimY],
        [scale, 0, 0, scale, 0, 0]
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

  if (options.cropMarks) {
    drawCropMarks(pdf, painter, layout);
  }

  return pdf;
}

/**
 * Returns the artwork as SVG markup at its physical trim size (e.g.
 * `width="40mm"`). SVG has no CMYK, so colors stay RGB; bleed and crop marks
 * are left to your layout tool.
 */
export async function getQRAsPrintSVG(
  props: QRProps,
  options: Pick<PrintOptions, "size" | "unit">
): Promise<string> {
  const layout = getPrintLayout(props, {
    size: options.size,
    unit: options.unit,
  });
  const markup = await renderPrintSVG(props);
  const unit = options.unit ?? "mm";
  const toUnit = (mm: number) =>
    `${Math.round((unit === "in" ? mm / MM_PER_INCH : mm) * 1000) / 1000}${unit}`;
  const rootTag = /^<svg\b[^>]*>/.exec(markup)?.[0];
  if (!rootTag) {
    throw new Error("Failed to render the QR code for printing");
  }
  const sizedTag = rootTag
    .replace(/\swidth="[^"]*"/, ` width="${toUnit(layout.trimWidth)}"`)
    .replace(/\sheight="[^"]*"/, ` height="${toUnit(layout.trimHeight)}"`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${sizedTag}${markup.slice(rootTag.length)}`;
}

/** Downloads `getQRAsPrintPDF` output (browser only). */
export async function downloadPrintPDF(
  props: QRProps,
  options: PrintOptions & { filename?: string }
): Promise<void> {
  const dataUrl = await getQRAsPrintPDF(props, options);
  downloadFile(dataUrl, options.filename ?? "qr-code-print.pdf");
}

/** Downloads `getQRAsPrintSVG` output (browser only). */
export async function downloadPrintSVG(
  props: QRProps,
  options: Pick<PrintOptions, "size" | "unit"> & { filename?: string }
): Promise<void> {
  const svg = await getQRAsPrintSVG(props, options);
  downloadFile(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    options.filename ?? "qr-code-print.svg"
  );
}
