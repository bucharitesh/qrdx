import type { JSX } from "react";
import type { QRPropsSVG } from "../types/react";
import { withElementFactory } from "./jsx/runtime";
import { REACT_ELEMENTS } from "./react-elements";
import { createQRCodeTree } from "./utils";

/**
 * The core renderer as a React component: every styling option is supported.
 * It draws with `createQRCodeTree`, building React elements directly, so its
 * markup is exactly `toSVGString`'s. No hooks: it renders in React Server
 * Components too.
 */
export function QRCodeSVG(props: QRPropsSVG): JSX.Element {
  return withElementFactory(REACT_ELEMENTS, () =>
    createQRCodeTree(props)
  ) as unknown as JSX.Element;
}
