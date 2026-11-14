import "server-only";

// Barcodes drawn on the server, for the image API (/api/v1/barcode), saved
// barcodes' downloads and MCP. The SVG comes from bwip-js's Node build with
// the same options as the browser (lib/barcode/draw.ts), so it's the same
// SVG the generator draws; raster files are that SVG rasterized with sharp
// at one pixel per unit (the generator's PNG size), and vector files are
// converted from it.
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
} from "bwip-js/node";
import { svgToEPS } from "qrdx";
import sharp from "sharp";
import {
  type BwipBuild,
  type DrawOptions,
  drawBarcode,
  printableSVG,
  type RenderedBarcode,
} from "./draw";
import { BARCODE_FILES, type BarcodeFileType } from "./files";
import { type BarcodeFormatId, getBarcodeFormat } from "./formats";
import { barcodePDF } from "./pdf";
import type { BarcodeStyle } from "./style";

type Drawing = ReturnType<typeof drawingSVG>;
type Encoder = (opts: RenderOptions, drawing: Drawing) => string;

const encoder =
  (encode: Encoder) =>
  (opts: DrawOptions, drawing: Drawing): string =>
    encode(opts as RenderOptions, drawing);

const NODE_BUILD: BwipBuild<Drawing> = {
  encoders: {
    ean13: encoder(ean13 as Encoder),
    ean8: encoder(ean8 as Encoder),
    upca: encoder(upca as Encoder),
    upce: encoder(upce as Encoder),
    code128: encoder(code128 as Encoder),
    code39: encoder(code39 as Encoder),
    itf14: encoder(itf14 as Encoder),
    "gs1-128": encoder(gs1_128 as Encoder),
    datamatrix: encoder(datamatrix as Encoder),
    pdf417: encoder(pdf417 as Encoder),
    aztec: encoder(azteccode as Encoder),
  },
  drawingSVG,
};

/** Largest raster side, in pixels: keeps a big PDF417 at scale 10 in bounds. */
export const MAX_RASTER_SIDE = 6000;

/** A barcode the encoder or the size limit refused, in words for the caller. */
export class BarcodeRenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BarcodeRenderError";
  }
}

/** The SVG, drawn by the Node build. Throws BarcodeRenderError. */
export function renderBarcodeServer(
  id: BarcodeFormatId,
  value: string,
  style: BarcodeStyle,
): RenderedBarcode {
  try {
    return drawBarcode(NODE_BUILD, id, value, style);
  } catch (error) {
    throw new BarcodeRenderError(
      error instanceof Error ? error.message : String(error),
    );
  }
}

export interface BarcodeFile {
  body: Uint8Array | string;
  contentType: string;
  extension: BarcodeFileType;
  /** Pixel size for raster files; points for vector ones */
  width: number;
  height: number;
}

async function raster(
  rendered: RenderedBarcode,
  type: "png" | "jpg" | "webp" | "avif",
): Promise<Uint8Array> {
  // One SVG unit is one pixel at 72 dpi: the generator's PNG size exactly.
  const image = sharp(Buffer.from(rendered.svg), { density: 72 });
  const encoded =
    type === "png"
      ? image.png({ compressionLevel: 9, palette: false })
      : type === "jpg"
        ? // Full chroma keeps colored bars' edges clean.
          image.jpeg({ quality: 92, chromaSubsampling: "4:4:4", mozjpeg: true })
        : type === "webp"
          ? image.webp({ lossless: true, effort: 4 })
          : image.avif({ lossless: true, effort: 4 });
  return new Uint8Array(await encoded.toBuffer());
}

/**
 * `value` in format `id` as a file of `type`. Raster files are the SVG at
 * `style.scale` pixels per unit; vector files are sized in points (one unit
 * is one point, a linear module 0.353 mm). Throws BarcodeRenderError when
 * the encoder refuses the value or the image would be too large.
 */
export async function renderBarcodeFile(
  id: BarcodeFormatId,
  value: string,
  style: BarcodeStyle,
  type: BarcodeFileType,
): Promise<BarcodeFile> {
  const rendered = renderBarcodeServer(id, value, style);
  const info = BARCODE_FILES[type];
  const title = `${getBarcodeFormat(id).label} barcode`;
  if (type === "svg") {
    return {
      body: printableSVG(rendered),
      contentType: `${info.mime}; charset=utf-8`,
      extension: type,
      width: rendered.widthUnits,
      height: rendered.heightUnits,
    };
  }
  if (type === "pdf") {
    return {
      body: barcodePDF(rendered, { title }),
      contentType: info.mime,
      extension: type,
      width: rendered.widthUnits,
      height: rendered.heightUnits,
    };
  }
  if (type === "eps") {
    return {
      body: await svgToEPS(rendered.svg, {
        width: rendered.widthUnits,
        background: style.background,
        title,
      }),
      contentType: info.mime,
      extension: type,
      width: rendered.widthUnits,
      height: rendered.heightUnits,
    };
  }
  if (
    Math.max(rendered.width, rendered.height) > MAX_RASTER_SIDE ||
    rendered.width < 1 ||
    rendered.height < 1
  ) {
    throw new BarcodeRenderError(
      `This barcode would be ${Math.round(rendered.width)} × ${Math.round(rendered.height)} px, over the ${MAX_RASTER_SIDE.toLocaleString("en-US")} px limit. Lower the scale.`,
    );
  }
  return {
    body: await raster(rendered, type),
    contentType: info.mime,
    extension: type,
    width: Math.round(rendered.width),
    height: Math.round(rendered.height),
  };
}
