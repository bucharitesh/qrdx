"use client";

import { cn } from "@repo/design-system/lib/utils";
import { type CSSProperties, useEffect, useRef } from "react";
import { isInteractive, observeVisibility } from "./engine";

interface GridLinesProps {
  className?: string;
  /** Cell size, CSS px. */
  cell?: number;
  /** Light up the lines around the pointer. */
  spotlight?: boolean;
}

const SPOT = 200;
const LINE = "color-mix(in oklab, var(--foreground) 6.5%, transparent)";
const HOT = "color-mix(in oklab, var(--foreground) 24%, transparent)";

const lines = (color: string, cell: number): CSSProperties => ({
  backgroundImage: `linear-gradient(to right, ${color} 1px, transparent 1px), linear-gradient(to bottom, ${color} 1px, transparent 1px)`,
  backgroundSize: `${cell}px ${cell}px`,
});

/**
 * Hairline grid that fills its (relative) parent. Around the pointer the lines
 * and their crossings light up; the lit patch is a small layer moved with a
 * transform, so a pointer move repaints only that patch. No canvas, no React
 * state per move. Static on touch and with reduced motion.
 */
export function GridLines({
  className,
  cell = 48,
  spotlight = true,
}: GridLinesProps) {
  const ref = useRef<HTMLDivElement>(null);
  const spotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    const spot = spotRef.current;
    const host = root?.parentElement;
    if (!root || !spot || !host || !spotlight || !isInteractive()) return;

    let raf = 0;
    let x = 0;
    let y = 0;
    let visible = false;
    const apply = () => {
      raf = 0;
      const ox = x - SPOT;
      const oy = y - SPOT;
      spot.style.transform = `translate3d(${ox}px, ${oy}px, 0)`;
      const dx = -ox + 0.5 - cell / 2;
      const dy = -oy + 0.5 - cell / 2;
      spot.style.backgroundPosition = `${dx}px ${dy}px, ${-ox}px ${-oy}px, ${-ox}px ${-oy}px`;
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType === "touch" || !visible) return;
      const r = root.getBoundingClientRect();
      x = e.clientX - r.left;
      y = e.clientY - r.top;
      root.dataset.active = "";
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const leave = () => {
      delete root.dataset.active;
    };
    const stopVisible = observeVisibility(root, (v) => {
      visible = v;
      if (!v) leave();
    });
    host.addEventListener("pointermove", move, { passive: true });
    host.addEventListener("pointerleave", leave, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      stopVisible();
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", leave);
    };
  }, [cell, spotlight]);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn(
        "group/grid pointer-events-none absolute inset-0 overflow-hidden",
        className,
      )}
    >
      <div
        className="absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_78%)]"
        style={lines(LINE, cell)}
      />
      {spotlight && (
        <div
          ref={spotRef}
          className="absolute top-0 left-0 opacity-0 transition-opacity duration-500 ease-[cubic-bezier(.32,.72,0,1)] will-change-transform group-data-active/grid:opacity-100 [mask-image:radial-gradient(closest-side,black,transparent)]"
          style={{
            width: SPOT * 2,
            height: SPOT * 2,
            transform: `translate3d(${-SPOT * 4}px, 0, 0)`,
            backgroundImage: `radial-gradient(circle, color-mix(in oklab, var(--foreground) 60%, transparent) 1.25px, transparent 1.75px), ${lines(HOT, cell).backgroundImage}`,
            backgroundSize: `${cell}px ${cell}px`,
          }}
        />
      )}
    </div>
  );
}
