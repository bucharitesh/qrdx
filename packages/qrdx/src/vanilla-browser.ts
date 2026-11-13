/** biome-ignore-all lint/performance/noBarrelFile: the no-bundler build */
// dist/vanilla.browser.mjs: qrdx/vanilla as one self-contained ES module for
// <script type="module"> without a bundler (zod inlined). It leaves out the
// official frame library's data (OFFICIAL_FRAMES, getOfficialFrame,
// OFFICIAL_FRAME_INDEX), which is hundreds of kilobytes; a page that wants
// it imports dist/frames-official.mjs next to this file. PDF export and the
// scan score load jspdf and jsqr on demand, which a page maps with an
// import map.

export * from "./engine";
export * from "./vanilla-api";
