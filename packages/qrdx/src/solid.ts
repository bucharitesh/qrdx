// qrdx/solid: the code as Solid components, written without JSX, so the
// package needs no Solid compiler. On the client a component returns the
// `<svg>` element itself, built with `renderToDOM` (createElementNS, no HTML
// parsing), from a memo: Solid inserts it, swaps in a new one when a prop
// changes the markup, and removes it on unmount. On a server it returns
// `toSVGString`'s markup with a hydration key on the root element, and
// hydration adopts that element instead of drawing it again, the way Solid's
// own <Dynamic> claims server elements.

import { createMemo, type JSX, untrack } from "solid-js";
// A namespace import: solid-js 1.8's server build has no getNextElement, and
// a named import of it would fail to link there (only the browser calls it)
import * as web from "solid-js/web";
import {
  createQRCodeTree,
  type QRCodeProps,
  type QRSVGOptions,
  renderToDOM,
  renderToString,
  resolveQRCodeProps,
} from "./core";

export type { QRCodeProps, QRSVGOptions } from "./core";

const ROOT_TAG = /^<[^\s/>]+/;

function draw(options: () => QRSVGOptions): JSX.Element {
  if (web.isServer) {
    const markup = renderToString(createQRCodeTree(options()));
    // ssr() output is written as is; the key lets hydration find the element
    const key = web.ssrHydrationKey();
    return web.ssr(
      key ? markup.replace(ROOT_TAG, (tag) => tag + key) : markup
    ) as unknown as JSX.Element;
  }
  const tree = createMemo(() => createQRCodeTree(options()));
  // Strings compare by value, so a change that draws the same markup stops here
  const markup = createMemo(() => renderToString(tree()));
  const fresh = () => {
    const element = renderToDOM(untrack(tree), document).firstChild as Element;
    // Out of its fragment: while hydrating, Solid takes a node that has a
    // parent for one that's already on the page and wouldn't insert it
    element.remove();
    return element;
  };
  const svg = createMemo(() => {
    markup();
    // While hydrating, the server's element (found by its key); otherwise new
    return web.getNextElement(fresh);
  });
  return svg as unknown as JSX.Element;
}

/**
 * The code as an `<svg>`, with every styling option `QRCodeSVG` takes in
 * React. Attributes such as `class`, `style` or `aria-label` go on the
 * `<svg>` (on the frame's outer `<svg>` with a frame).
 *
 * @example
 * <QRCodeSVG value="https://qrdx.dev" size={256} bodyPattern="rounded" />
 */
export function QRCodeSVG(props: QRSVGOptions): JSX.Element {
  return draw(() => ({ ...props }));
}

/**
 * `QRCodeSVG` with React's `QRCode` logo API: `logo`, `logoOptions`,
 * `hideLogo` and `scale`.
 *
 * @example
 * <QRCode value="https://qrdx.dev" logo="/logo.png" level="H" />
 */
export function QRCode(props: QRCodeProps): JSX.Element {
  return draw(() => resolveQRCodeProps({ ...props }));
}
