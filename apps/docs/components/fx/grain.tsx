import { cn } from "@repo/design-system/lib/utils";
import type { CSSProperties } from "react";
import styles from "./backdrops.module.css";

// Static film noise: SVG turbulence whose red channel becomes alpha, used as a
// mask over a foreground-coloured layer, so it follows the theme by itself.
const NOISE = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 9 0 0 0 -4.1'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>",
)}")`;

interface GrainProps {
  className?: string;
  /** Overrides the theme default strength (0.035 light, 0.055 dark). */
  opacity?: number;
}

/**
 * A subtle, static film-grain overlay for any gradient: it breaks up banding
 * and gives flat fills some texture. No motion, no canvas.
 */
export function Grain({ className, opacity }: GrainProps) {
  const style: CSSProperties = {
    WebkitMaskImage: NOISE,
    maskImage: NOISE,
    WebkitMaskSize: "180px 180px",
    maskSize: "180px 180px",
    ...(opacity === undefined ? null : { opacity }),
  };
  return (
    <div
      aria-hidden="true"
      className={cn(
        styles.layer,
        "bg-foreground opacity-[0.035] dark:opacity-[0.055]",
        className,
      )}
      style={style}
    />
  );
}
