// Draws barcodes as SVG with bwip-js (MIT, https://github.com/metafloor/bwip-js),
// a port of Barcode Writer in Pure PostScript (MIT, Terry Burton). Only the
// encoders below are imported, so the bundle carries these symbologies and
// not bwip-js's hundred others. The barcode page loads this module with a
// dynamic import (components/sections/tools/barcode-generator.tsx), so no
// other page downloads it.
import {
  azteccode,
  code39,
  code128,
  datamatrix,
  drawingSVG,
  ean8,
  ean13,
  gs1_128,
  itf14,
  pdf417,
  type RenderOptions,
  upca,
  upce,
} from "@bwip-js/browser";
import { type BarcodeFormatId, getBarcodeFormat } from "./formats";

type Encoder = (
  opts: RenderOptions,
  drawing: ReturnType<typeof drawingSVG>,
) => string;

const ENCODERS: Record<BarcodeFormatId, { bcid: string; encode: Encoder }> = {
  ean13: { bcid: "ean13", encode: ean13 },
  ean8: { bcid: "ean8", encode: ean8 },
  upca: { bcid: "upca", encode: upca },
  upce: { bcid: "upce", encode: upce },
  code128: { bcid: "code128", encode: code128 },
  code39: { bcid: "code39", encode: code39 },
  itf14: { bcid: "itf14", encode: itf14 },
  "gs1-128": { bcid: "gs1-128", encode: gs1_128 },
  datamatrix: { bcid: "datamatrix", encode: datamatrix },
  pdf417: { bcid: "pdf417", encode: pdf417 },
  aztec: { bcid: "azteccode", encode: azteccode },
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

export interface BarcodeStyle {
  /** Bars and text, as #rrggbb */
  foreground: string;
  /** Background, as #rrggbb */
  background: string;
  /** Print the human-readable digits or text under linear codes */
  showText: boolean;
  /** Bar height of linear codes, in millimetres */
  barHeightMm: number;
  /** Blank margin in modules: left and right of linear codes, all round 2D ones */
  quietZone: number;
  /** Pixels per drawing unit in the preview and PNG */
  scale: number;
}

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

/**
 * Draws `value` (already checked by validateBarcodeInput) as SVG. Throws a
 * readable Error when the encoder rejects it, e.g. too much data for a 2D code.
 */
export function renderBarcodeSVG(
  id: BarcodeFormatId,
  value: string,
  style: BarcodeStyle,
): RenderedBarcode {
  const format = getBarcodeFormat(id);
  const { bcid, encode } = ENCODERS[id];
  const linear = format.kind === "linear";
  const padding = Math.max(0, style.quietZone) * MODULE_UNITS[id];
  const color = hex(style.foreground);
  const options: RenderOptions = {
    bcid,
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
  };
  if (linear) {
    options.height = style.barHeightMm;
    options.includetext = style.showText;
    if (id === "code128" || id === "code39" || id === "gs1-128") {
      options.textxalign = "center";
    }
  }

  let svg: string;
  try {
    svg = encode(options, drawingSVG());
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
