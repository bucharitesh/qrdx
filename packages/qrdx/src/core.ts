/** biome-ignore-all lint/performance/noBarrelFile: the package's core entry */
// qrdx/core: the whole engine without React. Everything the main entry
// exports except the React components (QRCode, QRCodeSVG, QRCodeCanvas and
// getQRAsSVG, which returns a React element), plus the renderer they share:
// `createQRCodeTree` builds the code as plain nodes, and `renderToString`,
// `renderToDOM` and `toHyperscript` turn the nodes into markup, DOM nodes or
// another framework's elements. Nothing here imports react or react-dom.

export * from "./engine";
// The frame library's data is built as modules of its own and only
// re-exported here (tsup.config.ts), so bundlers skip what an app never uses.
export { OFFICIAL_FRAME_INDEX } from "./frames/catalogue/index";
export { getOfficialFrame, OFFICIAL_FRAMES } from "./frames/official";
