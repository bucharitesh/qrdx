// QRdx figures: small isometric drawings of the product (see
// hairline-figures.ts), as inline SVG rendered on the server. Each figure is
// its own chunk (figures/index.ts), so a page only carries the ones it shows.
// Colours and motion live in hairline.module.css; one shared client script
// (hairline-motion.tsx) drives the pointer depth and pauses off screen. The
// slot's size comes from CSS, so nothing shifts.

import { cn } from "@repo/design-system/lib/utils";
import { FIGURE_COMPONENTS } from "./figures";
import styles from "./hairline.module.css";
import type { HairlineFigureName } from "./hairline-figures";
import { FigureFrame } from "./hairline-motion";

export type { HairlineFigureName } from "./hairline-figures";

interface HairlineFigureProps {
  figure: HairlineFigureName;
  /**
   * Size the slot here (e.g. "aspect-square w-32" or "h-28 w-40"); the
   * drawing is fitted inside it. Without an aspect or height it's 5:4.
   */
  className?: string;
}

/** Decorative accent: hidden from assistive tech, follows the site theme. */
export function HairlineFigure({ figure, className }: HairlineFigureProps) {
  const Figure = FIGURE_COMPONENTS[figure];
  return (
    <FigureFrame
      className={cn(
        styles.figure,
        "relative aspect-[5/4] select-none",
        className
      )}
    >
      <Figure />
    </FigureFrame>
  );
}
