// The development JSX runtime (test runners compile JSX in dev mode).
import { jsx, jsxs, type QRNode } from "./runtime";

export type { JSX } from "./jsx-runtime";
export { Fragment } from "./runtime";

export function jsxDEV(
  type: unknown,
  props: object | null,
  key?: string | number | null,
  isStaticChildren?: boolean
): QRNode {
  return (isStaticChildren ? jsxs : jsx)(type, props, key);
}
