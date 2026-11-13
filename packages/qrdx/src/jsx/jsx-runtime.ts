/**
 * The automatic JSX runtime of the SVG renderer (see runtime.ts). A file opts
 * in with `/** @jsxImportSource ./jsx *\/` (relative to it).
 *
 * Attribute names and values are React's (`fillRule`, `strokeWidth`,
 * `style={{ … }}`), checked against React's SVG types when this package is
 * type-checked; nothing here imports React at run time, and the published
 * types of the core never reach this file.
 */
import type { JSX as ReactJSX } from "react";
import type { QRNode } from "./runtime";

export { Fragment, jsx, jsxs } from "./runtime";

type WithChildren<T> = Omit<T, "children" | "ref"> & { children?: unknown };

type IntrinsicElementsMap = {
  [K in keyof ReactJSX.IntrinsicElements]: WithChildren<
    ReactJSX.IntrinsicElements[K]
  >;
};

// biome-ignore lint/style/noNamespace: TypeScript reads JSX types from a namespace named JSX
export declare namespace JSX {
  type Element = QRNode;
  interface ElementChildrenAttribute {
    // biome-ignore lint/complexity/noBannedTypes: the JSX convention
    children: {};
  }
  interface IntrinsicAttributes {
    key?: string | number | null;
  }
  interface IntrinsicElements extends IntrinsicElementsMap {}
}
