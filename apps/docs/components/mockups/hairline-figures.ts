// The QRdx figure set: small isometric drawings of the product (codes,
// phones, pages, swatches, webhooks...) in the home hero's line style, each
// with a real code drawn by qrdx. scripts/figure-art/generate.ts writes them
// as inline-SVG components in ./figures; tests/figure-art.test.ts checks every
// name has one, every code decodes and every call site names a real figure.

export const FIGURE_NAMES = [
  "AuthorizedApp",
  "Chart",
  "CodeCard",
  "Domain",
  "Layers",
  "LinkSwap",
  "Loupe",
  "LostCode",
  "Measure",
  "PageForm",
  "Palette",
  "Plug",
  "Prompt",
  "Question",
  "ScanPhone",
  "Stack",
  "Terminal",
  "Webhook",
] as const;

export type HairlineFigureName = (typeof FIGURE_NAMES)[number];

/** Every figure draws on this 5:4 stage. */
export const FIGURE_VIEW_W = 320;
export const FIGURE_VIEW_H = 256;

/** "LinkSwap" → "link-swap", the module name. */
export const figureSlug = (name: HairlineFigureName) =>
  name.replace(/(?<=[a-z])(?=[A-Z])/g, "-").toLowerCase();
