"use client";

import { useEffect, useRef } from "react";
import { addTick, prefersReducedMotion } from "./ticker";

interface Flake {
  x: number;
  y: number;
  r: number;
  speed: number;
  sway: number;
  phase: number;
  alpha: number;
  push: number;
}

/**
 * Light snowfall on one canvas behind the page content: a few dozen small,
 * slow flakes that drift away from the cursor. One shared frame loop, paused
 * in background tabs; a single still frame under reduced motion.
 */
export function Snowfall({ count = 36 }: { count?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const reduced = prefersReducedMotion();
    let width = 0;
    let height = 0;
    let flakes: Flake[] = [];
    let color = "255 255 255";

    const make = (anywhere: boolean): Flake => ({
      x: Math.random() * width,
      y: anywhere ? Math.random() * height : -6,
      r: 0.8 + Math.random() * 1.6,
      speed: 10 + Math.random() * 18,
      sway: 6 + Math.random() * 14,
      phase: Math.random() * Math.PI * 2,
      alpha: 0.35 + Math.random() * 0.45,
      push: 0,
    });
    const resize = () => {
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const total =
        width < 640
          ? Math.round(count / 3)
          : width < 1280
            ? Math.round(count * 0.7)
            : count;
      flakes = Array.from({ length: total }, () => make(true));
      // Snow reads white on dark, a soft blue-grey on light.
      color = document.documentElement.classList.contains("dark")
        ? "255 255 255"
        : "148 163 184";
    };

    let pointer: { x: number; y: number } | null = null;
    let time = 0;
    const draw = () => {
      context.clearRect(0, 0, width, height);
      for (const flake of flakes) {
        context.beginPath();
        context.fillStyle = `rgb(${color} / ${flake.alpha})`;
        const x =
          flake.x +
          Math.sin(time * 0.6 + flake.phase) * flake.sway +
          flake.push;
        context.arc(x, flake.y, flake.r, 0, Math.PI * 2);
        context.fill();
      }
    };
    const tick = (dt: number) => {
      time += dt;
      for (const [index, flake] of flakes.entries()) {
        flake.y += flake.speed * dt;
        if (pointer) {
          // Drift away from the cursor.
          const dx = flake.x + flake.push - pointer.x;
          const dy = flake.y - pointer.y;
          const distance = Math.hypot(dx, dy);
          if (distance < 90 && distance > 0.1) {
            flake.push += (dx / distance) * (90 - distance) * dt * 2.2;
          }
        }
        flake.push *= 1 - Math.min(1, dt * 0.6);
        if (flake.y > height + 6) flakes[index] = make(false);
      }
      draw();
      return undefined;
    };

    resize();
    draw();
    window.addEventListener("resize", resize);
    if (reduced) return () => window.removeEventListener("resize", resize);

    const onMove = (event: PointerEvent) => {
      pointer =
        event.pointerType === "touch"
          ? null
          : { x: event.clientX, y: event.clientY };
    };
    const onLeave = () => {
      pointer = null;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    const theme = new MutationObserver(resize);
    theme.observe(document.documentElement, { attributeFilter: ["class"] });
    const stop = addTick(tick);
    return () => {
      stop();
      theme.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, [count]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full"
    />
  );
}
