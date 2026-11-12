import type { QRProps } from "qrdx/types";
import {
  SHOWCASE_PLACEMENTS as AT,
  type ShowcaseStyleName,
  showcaseProps,
} from "@/lib/landing/showcase-styles";

// The codes the plugin mockups draw: real qrdx renders (server-side SVG) in a
// different showcase style per plugin, matching what each plugin offers.
// tests/lib/showcase-styles.test.ts checks every one scans.

/** The value typed into each mock. */
export const VALUE = "https://qrdx.dev";

/** 25 modules (version 2 at Q) × 4 px: whole-number coordinates keep the markup small. */
const SIZE = 100;

const code = (name: ShowcaseStyleName, overrides?: Partial<QRProps>) =>
  showcaseProps(name, { value: VALUE, size: SIZE }, overrides);

const solid = (color: string) => ({
  fgColor: color,
  eyeColor: color,
  dotColor: color,
});

// Canva's pickers, each option drawn in the preview's style. (The app draws
// them on gear eyes, but a gear outline is ~10 KB of markup: too heavy for
// eight thumbnails on a prerendered page. The options are also the cheaper
// shapes to draw.)
const CANVA_BODIES = ["circle", "hexagon", "vertical-line", "liquid"] as const;
const CANVA_EYES = ["square", "octagon", "extra-rounded", "shield"] as const;
/** The option the Canva mock has picked in each row (its preview style). */
export const CANVA_PICKED = 1;

export const PLUGIN_CODES = {
  /** Chrome's "Classic" preset (circle dots, gear eyes). */
  chrome: code(AT["plugins.chrome"], solid("#000000")),
  /** Figma's "Minimal" preset: graphite square modules. */
  figma: code(AT["plugins.figma"], solid("#404040")),
  raycast: code(AT["plugins.raycast"]),
  canva: code(AT["plugins.canva"]),
  canvaBodies: CANVA_BODIES.map((bodyPattern) =>
    code(AT["plugins.canva"], { bodyPattern }),
  ),
  canvaEyes: CANVA_EYES.map((cornerEyePattern) =>
    code(AT["plugins.canva"], { cornerEyePattern }),
  ),
};
