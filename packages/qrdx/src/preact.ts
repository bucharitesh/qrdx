// qrdx/preact: the code as Preact components, drawn with Preact's own `h`
// (no preact/compat). The core builds the tree and `toHyperscript` turns it
// into Preact elements with DOM attribute names, which Preact sets on SVG
// elements as given, so the page gets the markup `toSVGString` writes, and
// preact-render-to-string writes it on a server. Preact diffs the elements
// itself; a component only rebuilds the tree when its props change.

import { Component, h, type VNode } from "preact";
import {
  createQRCodeTree,
  type QRCodeProps,
  type QRSVGOptions,
  resolveQRCodeProps,
  toHyperscript,
} from "./core";

export type { QRCodeProps, QRSVGOptions } from "./core";

const element = (
  type: string,
  attributes: Record<string, string>,
  children: (VNode | string)[],
  key: string | null
): VNode =>
  h(type, key === null ? attributes : { ...attributes, key }, ...children);

/** The code for `options` as Preact elements. */
function draw(options: QRSVGOptions): VNode {
  return toHyperscript(createQRCodeTree(options), element)[0] as VNode;
}

function sameProps(a: object, b: object): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) {
    return false;
  }
  return keys.every(
    (key) =>
      Object.hasOwn(b, key) &&
      Object.is(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key]
      )
  );
}

/** Skips a render when no prop changed, as React's `memo` does. */
// biome-ignore lint/style/useReactFunctionComponents: shouldComponentUpdate skips renders without preact/hooks or preact/compat (memo lives in compat)
abstract class Drawn<P extends object> extends Component<P> {
  override shouldComponentUpdate(next: P): boolean {
    return !sameProps(this.props, next);
  }
}

/**
 * The code as an `<svg>`, with every styling option `QRCodeSVG` takes in
 * React. Attributes such as `class`, `style` or `aria-label` go on the
 * `<svg>` (on the frame's outer `<svg>` with a frame).
 *
 * @example
 * <QRCodeSVG value="https://qrdx.dev" size={256} bodyPattern="rounded" />
 */
export class QRCodeSVG extends Drawn<QRSVGOptions> {
  override render(): VNode {
    return draw(this.props);
  }
}

/**
 * `QRCodeSVG` with React's `QRCode` logo API: `logo`, `logoOptions`,
 * `hideLogo` and `scale`.
 *
 * @example
 * <QRCode value="https://qrdx.dev" logo="/logo.png" level="H" />
 */
export class QRCode extends Drawn<QRCodeProps> {
  override render(): VNode {
    return draw(resolveQRCodeProps(this.props));
  }
}
