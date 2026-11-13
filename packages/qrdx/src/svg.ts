// The code as SVG markup or a DOM element, drawn without a framework.
import type { QRSVGOptions } from "../types";
import { renderToDOM } from "./render/dom";
import { renderToString } from "./render/string";
import { createQRCodeTree } from "./utils";

/**
 * The code's SVG markup: byte for byte what `<QRCodeSVG {...props} />`
 * renders with React (attributes forwarded to the root `<svg>`, and to the
 * frame's outer `<svg>` when there is a frame). Works anywhere, server or
 * browser.
 */
export function toSVGString(props: QRSVGOptions): string {
  return renderToString(createQRCodeTree(props));
}

/**
 * The code as an `<svg>` element, built with `createElementNS` (no HTML is
 * parsed). Pass `doc` to build it in another document.
 */
export function toSVGElement(
  props: QRSVGOptions,
  doc: Document = document
): SVGSVGElement {
  const fragment = renderToDOM(createQRCodeTree(props), doc);
  return fragment.firstChild as SVGSVGElement;
}
