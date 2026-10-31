import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import qrcodegen from "../../src/codegen";
import {
  DEFAULT_LEVEL,
  DEFAULT_MARGIN,
  ERROR_LEVEL_MAP,
} from "../../src/constants";
import { QRCodeSVG } from "../../src/utils";
import { parseSvgMarkup, type SvgNode } from "../../src/utils/svg-geometry";
import type { QRProps } from "../../types";
import { decodeQR, rasterizeSvg, simulateCamera } from "./raster";

/** SVG markup exactly as <QRCodeSVG> renders it. */
export function renderSvg(props: QRProps): string {
  return renderToStaticMarkup(createElement(QRCodeSVG, props));
}

// Tests capture the same props at several sizes in a row; keep the last
// parsed render (props with functions, such as custom templates, skip it).
let lastRender: { key: string; root: SvgNode } | null = null;

function parsedSvg(props: QRProps): SvgNode | string {
  const markup = () => renderSvg(props);
  if (props.customTemplate) return markup();
  const key = JSON.stringify(props);
  if (lastRender?.key !== key) {
    const root = parseSvgMarkup(markup());
    if (!root) return markup();
    lastRender = { key, root };
  }
  return lastRender.root;
}

/** Modules across the code itself (no margin). */
export function symbolSize(value: string, level = DEFAULT_LEVEL): number {
  return qrcodegen.QrCode.encodeText(value, ERROR_LEVEL_MAP[level]).size;
}

export interface CaptureOptions {
  /** Pixels per module on the sensor */
  modulePx: number;
  /** Phone-camera blur and contrast loss (default true) */
  camera?: boolean;
  /** Color around the artwork (paper), default white */
  page?: string;
}

/**
 * Renders `props`, rasterizes the code at `modulePx` per module on a page
 * with a 4-module border, optionally through the camera model, and decodes it.
 */
export function capture(
  props: QRProps,
  options: CaptureOptions
): string | null {
  const svg = parsedSvg(props);
  const modules =
    symbolSize(props.value, props.level) + 2 * (props.margin ?? DEFAULT_MARGIN);
  const image = rasterizeSvg(svg, {
    width: modules * options.modulePx,
    pad: 4 * options.modulePx,
    background: options.page ?? "#ffffff",
  });
  return decodeQR(
    options.camera === false ? image : simulateCamera(image, options.modulePx)
  );
}

/** Typical phone distances: small, medium and close (pixels per module). */
export const PHONE_MODULE_SIZES = [4, 6, 9] as const;
