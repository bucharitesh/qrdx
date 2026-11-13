// createQRCode: a code drawn into an element and kept up to date, for plain
// JavaScript (qrdx/vanilla re-exports it with the core).

import type { QRSVGOptions } from "../types";
import {
  createQRCodeTree,
  DEFAULT_SIZE,
  type DownloadFormat,
  downloadQRCode,
  getQRCodeDataUrl,
  renderToDOM,
  renderToString,
} from "./engine";

/** Options for `toDataURL` and `download`. */
export interface QRCodeExportOptions {
  /** Pixel size of the code (the frame adds to it); defaults to the code's `size` */
  size?: number;
  /** WebP only: 0 to 1 for a smaller lossy file */
  quality?: number;
}

export interface QRCodeDownloadOptions extends QRCodeExportOptions {
  /** "png" (default), "jpg", "webp", "svg", "pdf" (needs jspdf) or "eps" */
  format?: DownloadFormat;
  /** File name; defaults to one with the format and pixel size */
  filename?: string;
}

/** A code drawn into an element by `createQRCode`. */
export interface QRCodeInstance {
  /** The `<svg>` element on the page (null once destroyed) */
  readonly svg: SVGSVGElement | null;
  /** The options the code is drawn with now */
  readonly options: Readonly<QRSVGOptions>;
  /**
   * Merges `options` into the current ones and redraws (pass `undefined` to
   * drop an option). Nothing on the page changes when the markup doesn't.
   */
  update(options: Partial<QRSVGOptions>): void;
  /** The code's SVG markup, as `toSVGString` writes it */
  toSVGString(): string;
  /** The code as a data URL: "png" (default), "jpg", "webp", "svg", "pdf" or "eps" */
  toDataURL(
    format?: DownloadFormat,
    options?: QRCodeExportOptions
  ): Promise<string>;
  /** Saves the code as a file (a PNG unless `format` says otherwise) */
  download(options?: QRCodeDownloadOptions): Promise<void>;
  /** Removes the code from the page; `update` throws afterwards */
  destroy(): void;
}

const exportSize = (options: QRSVGOptions, size?: number) => {
  const side = size ?? options.size ?? DEFAULT_SIZE;
  return { width: side, height: side };
};

/**
 * Draws a QR code into `container` (an element, or a CSS selector for one)
 * and returns a handle to update, export or remove it. Takes every option
 * `QRCodeSVG` takes; attributes such as `className` or `aria-label` go on
 * the `<svg>`.
 *
 * @example
 * const qr = createQRCode("#qr", { value: "https://qrdx.dev", size: 256 });
 * qr.update({ fgColor: "#1d4ed8" });
 */
export function createQRCode(
  container: Element | string,
  options: QRSVGOptions
): QRCodeInstance {
  const parent =
    typeof container === "string"
      ? document.querySelector(container)
      : container;
  if (!parent) {
    throw new Error(`qrdx: no element matches ${String(container)}`);
  }
  let current: QRSVGOptions = { ...options };
  let svg: SVGSVGElement | null = null;
  let markup = "";
  let destroyed = false;

  const draw = () => {
    const tree = createQRCodeTree(current);
    const next = renderToString(tree);
    if (svg && next === markup) {
      return;
    }
    const element = renderToDOM(tree, parent.ownerDocument)
      .firstChild as SVGSVGElement;
    if (svg?.parentNode === parent) {
      svg.replaceWith(element);
    } else {
      parent.appendChild(element);
    }
    svg = element;
    markup = next;
  };

  draw();

  return {
    get svg() {
      return svg;
    },
    get options() {
      return current;
    },
    update(next) {
      if (destroyed) {
        throw new Error("qrdx: this QR code was destroyed");
      }
      current = { ...current, ...next } as QRSVGOptions;
      draw();
    },
    toSVGString() {
      return markup || renderToString(createQRCodeTree(current));
    },
    toDataURL(format = "png", exportOptions = {}) {
      return getQRCodeDataUrl(
        current,
        format,
        exportSize(current, exportOptions.size),
        { quality: exportOptions.quality }
      );
    },
    download(downloadOptions = {}) {
      return downloadQRCode(current, {
        format: downloadOptions.format ?? "png",
        size: exportSize(current, downloadOptions.size),
        filename: downloadOptions.filename,
        quality: downloadOptions.quality,
      });
    },
    destroy() {
      if (destroyed) {
        return;
      }
      destroyed = true;
      svg?.remove();
      svg = null;
    },
  };
}
