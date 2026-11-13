import type { JSX } from "react";
import type { QRPropsSVG } from "../types/react";
import { withElementFactory } from "./jsx/runtime";
import { drawPlainQRCode, preparePlainQRCode } from "./plain";
import { REACT_ELEMENTS } from "./react-elements";

/**
 * The plain code as a React element: one path for the dark modules on a
 * background rect, plus the logo and frame (`getQRAsSVGNode` is the same
 * without React). A logo that isn't a data URL is fetched as base64 first.
 */
export async function getQRAsSVG(props: QRPropsSVG): Promise<JSX.Element> {
  const plain = await preparePlainQRCode(props);
  return withElementFactory(REACT_ELEMENTS, () =>
    drawPlainQRCode(plain)
  ) as unknown as JSX.Element;
}
