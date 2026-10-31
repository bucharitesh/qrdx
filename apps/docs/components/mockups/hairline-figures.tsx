// The only file that imports @lucasmarkes/hairline (MIT): isometric SVG line
// figures that react to the pointer. The package is fetched on demand, the
// first time a figure mounts, so pages without one never load it.

import type { Figure, HairlineOptions } from "@lucasmarkes/hairline";

export type { Figure };

/** The figures QRdx uses. Add a name here to use another one. */
export const FIGURE_NAMES = [
  "Cabinet",
  "Exploded",
  "Hub",
  "Laptop",
  "Loupe",
  "Phone",
  "Phosphor",
  "Plot",
  "Plug",
  "Query",
  "Relay",
  "Settle",
  "Stack",
  "Terminal",
  "Terrain",
] as const;

export type HairlineFigureName = (typeof FIGURE_NAMES)[number];

type MountFigure = (el: HTMLElement, options?: HairlineOptions) => Figure;

/** Resolves to the imperative mount function for `name`. */
export async function loadFigure(
  name: HairlineFigureName,
): Promise<MountFigure> {
  const mod = await import("@lucasmarkes/hairline");
  return mod[name.toLowerCase() as Lowercase<HairlineFigureName>];
}
