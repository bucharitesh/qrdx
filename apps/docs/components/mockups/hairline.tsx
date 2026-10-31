"use client";

// Hairline accents (decorative, pointer-reactive line figures). Figures load
// lazily on the client, so they never block first paint, and the slot keeps
// its size while loading.

import { cn } from "@repo/design-system/lib/utils";
import { FIGURES } from "./hairline-figures";

export type HairlineFigureName =
  | "Hub"
  | "Loupe"
  | "Phosphor"
  | "Plug"
  | "Stack";

interface HairlineFigureProps {
  figure: HairlineFigureName;
  /** Size the slot here (e.g. "aspect-square w-48"); the figure fills it. */
  className?: string;
  /** 0–1, how strongly the figure reacts to the pointer. */
  intensity?: number;
}

/** Decorative accent: hidden from assistive tech, follows the site theme. */
export function HairlineFigure({
  figure,
  className,
  intensity = 0.5,
}: HairlineFigureProps) {
  const Figure = FIGURES[figure];
  return (
    <div aria-hidden="true" className={cn("text-muted-foreground", className)}>
      {Figure && (
        <Figure className="size-full" intensity={intensity} theme="auto" />
      )}
    </div>
  );
}
