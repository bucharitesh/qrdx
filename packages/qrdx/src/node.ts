// The Node-only entry (`qrdx/node`). PNG rasterization needs an optional
// native rasterizer (@resvg/resvg-js or sharp), and bundlers follow dynamic
// imports as well as static ones, so this lives apart from the main entry:
// dist/index.mjs never mentions either package, and an app that bundles the
// library for the browser doesn't try to link a native module. Import it
// from "qrdx/node", never from "qrdx", when you want a PNG on a server.

// It draws with qrdx/core (built as dist/core, which this entry imports), so
// it needs neither react nor react-dom.
import type { QRProps } from "../types";
import { DEFAULT_SIZE, getQRAsSVGDataUri, withQRSize } from "./core";
import {
  loadLogoForRasterizer,
  type RasterLogo,
  rasterizeSvgToPng,
} from "./rasterize";

export interface QRAsPNGOptions {
  /** Pixel size of the code; defaults to the props' own size (128). */
  size?: number;
  /**
   * Whether logos that aren't already data URLs are loaded: http(s) URLs are
   * fetched (1 MB cap, no redirects) and local paths are read from disk. Off
   * by default, so a server passing a caller's imageSettings through can't
   * be made to fetch internal URLs or read files off its own disk.
   */
  loadExternalLogos?: boolean;
}

/**
 * The code as PNG bytes (plus its frame, if any), without a browser: the SVG
 * the library renders is rasterized by an optional peer dependency —
 * `@resvg/resvg-js`, which draws the SVG (logos included) the way browsers
 * do, or `sharp` — loaded only when this is called. A logo is embedded as a
 * data URL first: a data URL is kept as-is, and with `loadExternalLogos` an
 * http(s) URL is fetched and a local path is read from disk (Node). A logo
 * that can't be loaded is left out, like in the browser.
 */
export async function getQRAsPNG(
  qrProps: QRProps,
  options: QRAsPNGOptions = {}
): Promise<Uint8Array> {
  const size = options.size ?? qrProps.size ?? DEFAULT_SIZE;
  const propsWithSize = withQRSize(qrProps, size);

  const src = propsWithSize.imageSettings?.src;
  const logo: RasterLogo | null = src
    ? await loadLogoForRasterizer(src, options.loadExternalLogos === true)
    : null;
  const propsWithLogo =
    logo && propsWithSize.imageSettings && logo.dataUrl !== src
      ? {
          ...propsWithSize,
          imageSettings: { ...propsWithSize.imageSettings, src: logo.dataUrl },
        }
      : propsWithSize;

  const svgDataUri = await getQRAsSVGDataUri(propsWithLogo);
  const svg = decodeURIComponent(svgDataUri.replace("data:image/svg+xml,", ""));
  return await rasterizeSvgToPng(svg, logo);
}
