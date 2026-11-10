// Draws barcodes as SVG in the browser with bwip-js (MIT,
// https://github.com/metafloor/bwip-js), a port of Barcode Writer in Pure
// PostScript (MIT, Terry Burton). Only the encoders below are imported, so
// the bundle carries these symbologies and not bwip-js's hundred others. The
// generator loads this module with a dynamic import
// (components/sections/tools/barcode-generator.tsx), so no other page
// downloads it. The options and the SVG's finishing touches live in
// lib/barcode/draw.ts, shared with the server's Node build (lib/barcode/server.ts).
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
import {
  type BwipBuild,
  type DrawOptions,
  drawBarcode,
  type RenderedBarcode,
} from "./draw";
import type { BarcodeFormatId } from "./formats";
import type { BarcodeStyle } from "./style";

export {
  encoderMessage,
  MM_PER_UNIT,
  MODULE_UNITS,
  printableSVG,
  type RenderedBarcode,
} from "./draw";
export type { BarcodeStyle } from "./style";

type Drawing = ReturnType<typeof drawingSVG>;
type Encoder = (opts: RenderOptions, drawing: Drawing) => string;

const encoder =
  (encode: Encoder) =>
  (opts: DrawOptions, drawing: Drawing): string =>
    encode(opts as RenderOptions, drawing);

const BROWSER_BUILD: BwipBuild<Drawing> = {
  encoders: {
    ean13: encoder(ean13),
    ean8: encoder(ean8),
    upca: encoder(upca),
    upce: encoder(upce),
    code128: encoder(code128),
    code39: encoder(code39),
    itf14: encoder(itf14),
    "gs1-128": encoder(gs1_128),
    datamatrix: encoder(datamatrix),
    pdf417: encoder(pdf417),
    aztec: encoder(azteccode),
  },
  drawingSVG,
};

/**
 * Draws `value` (already checked by validateBarcodeInput) as SVG. Throws a
 * readable Error when the encoder rejects it, e.g. too much data for a 2D code.
 */
export function renderBarcodeSVG(
  id: BarcodeFormatId,
  value: string,
  style: BarcodeStyle,
): RenderedBarcode {
  return drawBarcode(BROWSER_BUILD, id, value, style);
}
