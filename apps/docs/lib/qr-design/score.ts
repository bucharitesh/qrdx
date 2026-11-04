import "server-only";

import { ImageResponse } from "next/og";
import {
  decodePNGPixels,
  getFrameDimensions,
  getScanScoreFromPixels,
  PIXEL_SCORE_MIN_CODE_WIDTH,
  QRCodeSVG,
  type QRProps,
  type ScanScoreResult,
  withQRSize,
} from "qrdx";
import { createElement } from "react";
import { serializeQrSvg } from "@/lib/qr-render";
import type { ThemeStyles } from "@/types/theme";
import { designQRProps } from "./props";

// The editor's scan score, run on the server: the design is rendered by the
// engine (QRCodeSVG), rasterized with resvg (next/og, as the image API does)
// and scored by qrdx's getScanScoreFromPixels, which shares every check,
// weight and the camera model with the browser's getScanScore.

/**
 * Stands in for any logo: an opaque grey block covers the same modules a
 * real logo would (the browser score uses the same stand-in when a logo
 * can't be loaded), so the score doesn't depend on the logo's colours.
 */
const LOGO_PLACEHOLDER = `data:image/svg+xml;base64,${Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><rect width="10" height="10" rx="2" fill="#808080"/></svg>',
).toString("base64")}`;

/** Thrown when the content doesn't fit in a QR code at the chosen level. */
export class DesignTooLongError extends Error {
  constructor() {
    super(
      "The content is too long for a QR code at this error correction level. Shorten it or use level L.",
    );
    this.name = "DesignTooLongError";
  }
}

function svgOf(props: QRProps): string {
  try {
    return serializeQrSvg(createElement(QRCodeSVG, props));
  } catch (error) {
    if (error instanceof RangeError && error.message === "Data too long") {
      throw new DesignTooLongError();
    }
    throw error;
  }
}

async function rasterize(
  svg: string,
  width: number,
  height: number,
): Promise<Uint8Array> {
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  const image = new ImageResponse(
    createElement(
      "div",
      { style: { display: "flex", width: "100%", height: "100%" } },
      createElement("img", { alt: "", height, src, width }),
    ),
    { width, height },
  );
  return new Uint8Array(await image.arrayBuffer());
}

/**
 * The scan score the editor's badge would show for `value` in `style`
 * (logos scored by their footprint). Throws DesignTooLongError when the
 * content can't be encoded at the style's level.
 */
export async function scoreDesign(
  value: string,
  style: ThemeStyles,
): Promise<ScanScoreResult> {
  const props = withQRSize(
    designQRProps(value, style, LOGO_PLACEHOLDER),
    PIXEL_SCORE_MIN_CODE_WIDTH,
  );
  const svg = svgOf(props);
  const artwork = getFrameDimensions(PIXEL_SCORE_MIN_CODE_WIDTH, props.frame);
  const png = await rasterize(
    svg,
    Math.ceil(artwork.width),
    Math.ceil(artwork.height),
  );
  const pixels = await decodePNGPixels(png);
  if (!pixels) throw new Error("Could not read the rendered QR code");
  return getScanScoreFromPixels(props, pixels);
}

export interface RenderOptions {
  /**
   * Raise error correction to H when the logo covers more than 7% of the
   * code (the engine's autoLevel). For renders nobody scores first.
   */
  autoLevel?: boolean;
}

function renderProps(
  value: string,
  style: ThemeStyles,
  logo: string | undefined,
  { autoLevel }: RenderOptions,
): QRProps {
  const props = designQRProps(value, style, logo);
  return autoLevel && props.imageSettings ? { ...props, autoLevel } : props;
}

/**
 * SVG markup of the design, `size` px wide (code only; frames add to it).
 * `logo` is the image drawn when the style shows a logo: a data URL QRdx
 * built or read itself (lib/qr-api/logo.ts), never an address from a caller.
 */
export function renderDesignSvg(
  value: string,
  style: ThemeStyles,
  size = 512,
  logo?: string,
  options: RenderOptions = {},
): string {
  return svgOf(withQRSize(renderProps(value, style, logo, options), size));
}

/** PNG bytes of the design with the code `size` px wide (`logo` as above). */
export async function renderDesignPng(
  value: string,
  style: ThemeStyles,
  size = 512,
  logo?: string,
  options: RenderOptions = {},
): Promise<Uint8Array> {
  const props = withQRSize(renderProps(value, style, logo, options), size);
  const artwork = getFrameDimensions(size, props.frame);
  return rasterize(
    svgOf(props),
    Math.ceil(artwork.width),
    Math.ceil(artwork.height),
  );
}
