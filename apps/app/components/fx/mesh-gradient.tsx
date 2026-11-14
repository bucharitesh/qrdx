"use client";

import { cn } from "@repo/design-system/lib/utils";
import { useRef } from "react";
import styles from "./backdrops.module.css";
import { Grain } from "./grain";
import { usePlayback } from "./use-playback";

interface MeshGradientProps {
  className?: string;
  /** "cool": neutral + a brand-blue and violet tint; "warm": sand-neutral. */
  tone?: "cool" | "warm";
  /** Adds the static grain overlay (on by default: it hides banding). */
  grain?: boolean;
}

// Field colours per tone, light and dark tuned separately: a tint on white
// needs less than light on graphite, and warm sand must stay off-white.
const TONES = {
  cool: [
    "[--mesh-a:color-mix(in_oklab,var(--primary)_8%,transparent)]",
    "[--mesh-b:color-mix(in_oklab,var(--foreground)_3.5%,transparent)]",
    "[--mesh-c:color-mix(in_oklab,oklch(0.6_0.15_295)_6%,transparent)]",
    "dark:[--mesh-a:color-mix(in_oklab,var(--primary)_13%,transparent)]",
    "dark:[--mesh-b:color-mix(in_oklab,var(--foreground)_5.5%,transparent)]",
    "dark:[--mesh-c:color-mix(in_oklab,oklch(0.62_0.16_295)_9%,transparent)]",
  ].join(" "),
  warm: [
    "[--mesh-a:color-mix(in_oklab,oklch(0.82_0.07_70)_26%,transparent)]",
    "[--mesh-b:color-mix(in_oklab,var(--foreground)_3%,transparent)]",
    "[--mesh-c:color-mix(in_oklab,var(--primary)_4.5%,transparent)]",
    "dark:[--mesh-a:color-mix(in_oklab,oklch(0.8_0.05_70)_9%,transparent)]",
    "dark:[--mesh-b:color-mix(in_oklab,var(--foreground)_5%,transparent)]",
    "dark:[--mesh-c:color-mix(in_oklab,var(--primary)_7%,transparent)]",
  ].join(" "),
} as const;

/**
 * Three large, soft colour fields that drift very slowly (68–96 s loops).
 * CSS radial gradients moved with transforms; paused off screen, static with
 * reduced motion.
 */
export function MeshGradient({
  className,
  tone = "cool",
  grain = true,
}: MeshGradientProps) {
  const ref = useRef<HTMLDivElement>(null);
  usePlayback(ref);
  return (
    <div
      ref={ref}
      aria-hidden="true"
      data-paused=""
      className={cn(styles.layer, TONES[tone], className)}
    >
      <div className={cn(styles.blob, styles.blobA)} />
      <div className={cn(styles.blob, styles.blobB)} />
      <div className={cn(styles.blob, styles.blobC)} />
      {grain && <Grain />}
    </div>
  );
}
