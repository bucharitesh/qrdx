/** biome-ignore-all lint/performance/noBarrelFile: false positive */
// The main entry: the React components plus everything in qrdx/core (the
// React-free engine they draw with). The components build React elements
// through the same renderer as the core, so their markup is the core's.

export type { QRPropsCanvas, QRPropsSVG } from "../types/react";
export * from "./api";
export * from "./core";
export * from "./qr-code";
// QRCodeCanvas is the only export that needs client-only hooks. It lives in
// its own "use client" module (built as a separate entry) so the rest of the
// package stays usable from React Server Components.
export { QRCodeCanvas } from "./qr-code-canvas";
export { QRCodeSVG } from "./qr-code-svg";
