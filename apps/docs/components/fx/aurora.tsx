"use client";

import { cn } from "@repo/design-system/lib/utils";
import { useRef } from "react";
import styles from "./backdrops.module.css";
import { Grain } from "./grain";
import { usePlayback } from "./use-playback";

interface AuroraProps {
  className?: string;
  /** "brand": a faint blue/violet tint; "neutral": luminance only. */
  tone?: "brand" | "neutral";
  /** Adds the static grain overlay (on by default). */
  grain?: boolean;
}

// Light and dark tuned separately: on white the band is a pale tint with a
// grey core; on graphite it is light, so it needs about twice the amount.
const BASE = [
  "[--au-core:color-mix(in_oklab,var(--foreground)_3%,transparent)]",
  "[--au-rim:color-mix(in_oklab,var(--foreground)_14%,transparent)]",
  "dark:[--au-core:color-mix(in_oklab,var(--foreground)_6.5%,transparent)]",
  "dark:[--au-rim:color-mix(in_oklab,var(--foreground)_22%,transparent)]",
].join(" ");
const TONES = {
  brand: [
    "[--au-1:color-mix(in_oklab,var(--primary)_7%,transparent)]",
    "[--au-2:color-mix(in_oklab,oklch(0.62_0.14_295)_5%,transparent)]",
    "dark:[--au-1:color-mix(in_oklab,var(--primary)_14%,transparent)]",
    "dark:[--au-2:color-mix(in_oklab,oklch(0.66_0.15_295)_9%,transparent)]",
  ].join(" "),
  neutral: [
    "[--au-1:color-mix(in_oklab,var(--foreground)_3.5%,transparent)]",
    "[--au-2:color-mix(in_oklab,var(--foreground)_2.5%,transparent)]",
    "dark:[--au-1:color-mix(in_oklab,var(--foreground)_6%,transparent)]",
    "dark:[--au-2:color-mix(in_oklab,var(--foreground)_4%,transparent)]",
  ].join(" "),
} as const;

/**
 * A soft band of light across the top of a section: a conic fan and two
 * tinted fields under a hairline rim, fading out downwards. Shifts very
 * slowly (56 s); paused off screen, static with reduced motion.
 */
export function Aurora({
  className,
  tone = "brand",
  grain = true,
}: AuroraProps) {
  const ref = useRef<HTMLDivElement>(null);
  usePlayback(ref);
  return (
    <div
      ref={ref}
      aria-hidden="true"
      data-paused=""
      className={cn(styles.layer, styles.aurora, BASE, TONES[tone], className)}
    >
      <div className={styles.auroraBand} />
      <div className={styles.auroraRim} />
      {grain && <Grain />}
    </div>
  );
}
