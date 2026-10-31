"use client";

import { cn } from "@repo/design-system/lib/utils";
import { useEffect, useRef } from "react";
import styles from "./backdrops.module.css";
import { isInteractive, observeVisibility } from "./engine";

interface RadialHaloProps {
  className?: string;
  /** Centre of the halo, any CSS length or percentage of the layer. */
  x?: string;
  y?: string;
  /** Size of the glow, CSS px. */
  width?: number;
  height?: number;
  /** "brand": faint blue, "violet": faint violet, "neutral": luminance only. */
  tone?: "brand" | "violet" | "neutral";
  /** Lean towards a mouse or pen (a third of the way, eased). */
  follow?: boolean;
}

const LEAN = 0.32;

// Light and dark tuned separately (a tint on white needs about half).
const TONES = {
  brand: [
    "[--halo-core:color-mix(in_oklab,var(--primary)_9%,transparent)]",
    "[--halo-edge:color-mix(in_oklab,var(--foreground)_3%,transparent)]",
    "dark:[--halo-core:color-mix(in_oklab,var(--primary)_16%,transparent)]",
    "dark:[--halo-edge:color-mix(in_oklab,var(--foreground)_5%,transparent)]",
  ].join(" "),
  violet: [
    "[--halo-core:color-mix(in_oklab,oklch(0.58_0.17_290)_8%,transparent)]",
    "[--halo-edge:color-mix(in_oklab,var(--primary)_3%,transparent)]",
    "dark:[--halo-core:color-mix(in_oklab,oklch(0.64_0.17_290)_14%,transparent)]",
    "dark:[--halo-edge:color-mix(in_oklab,var(--primary)_6%,transparent)]",
  ].join(" "),
  neutral: [
    "[--halo-core:color-mix(in_oklab,var(--foreground)_5%,transparent)]",
    "[--halo-edge:color-mix(in_oklab,var(--foreground)_2%,transparent)]",
    "dark:[--halo-core:color-mix(in_oklab,var(--foreground)_8%,transparent)]",
    "dark:[--halo-edge:color-mix(in_oklab,var(--foreground)_3.5%,transparent)]",
  ].join(" "),
} as const;

/**
 * One soft spotlight behind a focal object (a card, a form, a logo). With
 * `follow` it leans towards the pointer: pointer moves only set a transform
 * (no React render), and it eases home when the pointer leaves. Static on
 * touch and with reduced motion.
 */
export function RadialHalo({
  className,
  x = "50%",
  y = "50%",
  width = 900,
  height = Math.round(width * 0.68),
  tone = "brand",
  follow = false,
}: RadialHaloProps) {
  const ref = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const layer = ref.current;
    const glow = glowRef.current;
    const parent = layer?.parentElement;
    const host = parent?.hasAttribute("data-backdrop")
      ? parent.parentElement
      : parent;
    if (!follow || !layer || !glow || !host || !isInteractive()) return;

    let raf = 0;
    let dx = 0;
    let dy = 0;
    let visible = false;
    const apply = () => {
      raf = 0;
      glow.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType === "touch" || !visible) return;
      const g = glow.getBoundingClientRect();
      // The glow's resting centre: its current box minus the current lean.
      const cx = g.left + g.width / 2 - dx;
      const cy = g.top + g.height / 2 - dy;
      dx = (e.clientX - cx) * LEAN;
      dy = (e.clientY - cy) * LEAN;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const leave = () => {
      dx = 0;
      dy = 0;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const stopVisible = observeVisibility(layer, (v) => {
      visible = v;
    });
    host.addEventListener("pointermove", move, { passive: true });
    host.addEventListener("pointerleave", leave, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      stopVisible();
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", leave);
    };
  }, [follow]);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        TONES[tone],
        className,
      )}
    >
      <div
        ref={glowRef}
        className={styles.haloGlow}
        style={{ left: x, top: y, width, height }}
      />
    </div>
  );
}
