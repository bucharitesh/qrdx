/** biome-ignore-all lint/performance/noBarrelFile: the vanilla entry re-exports the core */
// qrdx/vanilla: QR codes in plain JavaScript, no framework. `createQRCode`
// draws a code into an element and keeps it up to date, and everything in
// qrdx/core (markup, downloads, the scan score…) is re-exported, so one
// import covers a page. Built as dist/vanilla.mjs, which imports
// dist/core.mjs, for bundlers; vanilla-browser.ts is the same API as one
// file for <script type="module"> without a bundler.

export * from "./core";
export * from "./vanilla-api";
