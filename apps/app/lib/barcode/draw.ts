// Draws a barcode as SVG with bwip-js, given the encoders of one bwip-js
// build: the browser build in lib/barcode/render.ts (the generator and the
// dashboard) and the Node build in lib/barcode/server.ts (the image API,
// MCP and server downloads). Both are bwip-js 4.11.4 (package.json pins
// @bwip-js/browser and bwip-js to the same version), and every option is
// built here, so the two return the same SVG byte for byte
// (tests/barcode/parity.test.ts).
import { type BarcodeFormatId, getBarcodeFormat } from "./formats";
import type { BarcodeRotation, BarcodeStyle } from "./style";

export type { BarcodeStyle } from "./style";

/** The bwip-js options this module sets (a subset of RenderOptions). */
export interface DrawOptions {
  bcid: string;
  text: string;
  scale: number;
  barcolor: string;
  textcolor: string;
  bordercolor: string;
  backgroundcolor: string;
  paddingwidth: number;
  paddingheight: number;
  rotate: "N" | "R" | "L" | "I";
  height?: number;
  includetext?: boolean;
  textxalign?: "center";
}

/** One bwip-js build: its encoder per format and its SVG drawing. */
export interface BwipBuild<Drawing> {
  encoders: Record<
    BarcodeFormatId,
    (opts: DrawOptions, drawing: Drawing) => string
  >;
  drawingSVG: () => Drawing;
}

/** bwip-js encoder names (bcid), which the build's functions are named after. */
export const BCID: Record<BarcodeFormatId, string> = {
  ean13: "ean13",
  ean8: "ean8",
  upca: "upca",
  upce: "upce",
  code128: "code128",
  code39: "code39",
  itf14: "itf14",
  "gs1-128": "gs1-128",
  datamatrix: "datamatrix",
  pdf417: "pdf417",
  aztec: "azteccode",
};

/**
 * bwip-js drawing units per module: linear bars and PDF417 columns are one
 * unit wide, Data Matrix and Aztec cells two. Padding is given in units.
 */
export const MODULE_UNITS: Record<BarcodeFormatId, number> = {
  ean13: 1,
  ean8: 1,
  upca: 1,
  upce: 1,
  code128: 1,
  code39: 1,
  itf14: 1,
  "gs1-128": 1,
  datamatrix: 2,
  pdf417: 1,
  aztec: 2,
};

/** One drawing unit is one PostScript point: 25.4 / 72 mm. */
export const MM_PER_UNIT = 25.4 / 72;

const ROTATE: Record<BarcodeRotation, DrawOptions["rotate"]> = {
  0: "N",
  90: "R",
  180: "I",
  270: "L",
};

export interface RenderedBarcode {
  /** SVG at `scale` (one unit = `scale` px), with width and height set */
  svg: string;
  /** Pixel size at `scale`: the PNG's size */
  width: number;
  height: number;
  /** Size at one unit per point, for vector downloads */
  widthUnits: number;
  heightUnits: number;
}

const hex = (color: string) => color.replace(/^#/, "").toLowerCase();

/** The bwip-js options for `value` in format `id`, drawn with `style`. */
export function drawOptions(
  id: BarcodeFormatId,
  value: string,
  style: BarcodeStyle,
): DrawOptions {
  const linear = getBarcodeFormat(id).kind === "linear";
  const padding = Math.max(0, style.quietZone) * MODULE_UNITS[id];
  const color = hex(style.foreground);
  const options: DrawOptions = {
    bcid: BCID[id],
    text: value,
    scale: style.scale,
    barcolor: color,
    textcolor: color,
    bordercolor: color,
    backgroundcolor: hex(style.background),
    paddingwidth: padding,
    // Linear codes need no quiet zone above and below; a little keeps the
    // bars off the image edge.
    paddingheight: linear ? Math.min(padding, 2) : padding,
    rotate: ROTATE[style.rotation ?? 0] ?? "N",
  };
  if (linear) {
    options.height = style.barHeightMm;
    options.includetext = style.showText;
    if (id === "code128" || id === "code39" || id === "gs1-128") {
      options.textxalign = "center";
    }
  }
  return options;
}

/**
 * Draws `value` (already checked by validateBarcodeInput) as SVG with one
 * bwip-js build. Throws a readable Error when the encoder rejects it, e.g.
 * too much data for a 2D code.
 */
export function drawBarcode<Drawing>(
  build: BwipBuild<Drawing>,
  id: BarcodeFormatId,
  value: string,
  style: BarcodeStyle,
): RenderedBarcode {
  const format = getBarcodeFormat(id);
  let svg: string;
  try {
    svg = build.encoders[id](drawOptions(id, value, style), build.drawingSVG());
  } catch (error) {
    throw new Error(encoderMessage(format.label, error));
  }

  const viewBox = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  if (!viewBox) throw new Error(`Couldn't draw this ${format.label}.`);
  const width = Number(viewBox[1]);
  const height = Number(viewBox[2]);
  return {
    svg: svg.replace(
      "<svg ",
      `<svg width="${width}" height="${height}" shape-rendering="crispEdges" `,
    ),
    width,
    height,
    widthUnits: width / style.scale,
    heightUnits: height / style.scale,
  };
}

/** bwip-js errors read "bwipp.ean13badLength#6878: EAN-13 must be …". */
export function encoderMessage(label: string, error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const message = raw.replace(/^bwip(?:p|-js)\.?[\w.]*#?\d*:\s*/, "").trim();
  if (/too long|too much|exceeds|InputTooLong/i.test(raw)) {
    return `Too much data for one ${label}. Shorten the text.`;
  }
  const ai = /^AI (\d+): (.*)$/.exec(message);
  if (ai) {
    const detail = ai[2] as string;
    return `AI (${ai[1]}): ${detail.charAt(0).toLowerCase()}${detail.slice(1)}.`;
  }
  return message ? `${label}: ${message}` : `Couldn't draw this ${label}.`;
}

/**
 * The SVG for download: sized in millimetres so one drawing unit is one
 * point (a linear module is 0.353 mm, the bars as tall as set) and print
 * layouts place it at that size.
 */
export function printableSVG(rendered: RenderedBarcode): string {
  const mm = (units: number) => (units * MM_PER_UNIT).toFixed(3);
  return rendered.svg.replace(
    /<svg width="[\d.]+" height="[\d.]+"/,
    `<svg width="${mm(rendered.widthUnits)}mm" height="${mm(rendered.heightUnits)}mm"`,
  );
}
