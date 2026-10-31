"use client";

// Hairline accents (decorative, pointer-reactive line figures). Figures load
// lazily on the client, so they never block first paint, and the slot keeps
// its size while loading. They come alive twice: the first time they scroll
// into view (the drawing assembles back to front, dashed guides draw in, dots
// light up in a wave, then the figure walks through its own answer once) and
// on hover (it lifts and floats while the pointer drives it).

import { cn } from "@repo/design-system/lib/utils";
import { type CSSProperties, useEffect, useRef } from "react";
import {
  type Figure,
  type HairlineFigureName,
  loadFigure,
} from "./hairline-figures";

export type { HairlineFigureName };

interface HairlineFigureProps {
  figure: HairlineFigureName;
  /** Size the slot here (e.g. "aspect-square w-48"); the figure fills it. */
  className?: string;
  /** 0–1, how strongly the figure reacts to the pointer. */
  intensity?: number;
  /** The surface the figure sits on; plates are filled with it. */
  surface?: "background" | "card" | "muted";
  /** Animate in on first view and walk through the figure once. Default true. */
  intro?: boolean;
}

const EASE = "cubic-bezier(.32,.72,0,1)";
/** How long the figure walks through its own answer after the intro. */
const TOUR_MS = 5600;

// Strokes from the site's tokens, mixed opaque so crossings never darken.
const mix = (pct: number) =>
  `color-mix(in oklab, var(--foreground) ${pct}%, var(--hl-surface))`;
const PALETTE = {
  "--hairline-plate": "var(--hl-surface)",
  "--hairline-hi": mix(88),
  "--hairline-edge": mix(56),
  "--hairline-mid": mix(34),
  "--hairline-lo": mix(16),
} as CSSProperties;

const SURFACE = {
  background: "var(--background)",
  card: "var(--card)",
  muted: "var(--muted)",
};

const reducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Share of the slot the drawing fills, and the most it is ever zoomed. */
const FILL = 0.88;
const MAX_ZOOM = 1.9;

/**
 * Every figure draws on a fixed 400×320 stage with wide margins (room for its
 * moving parts), so on its own the drawing fills well under half the slot.
 * Zoom the stage so the drawing itself fills the slot, centred. The transform
 * sits on the host, so the figure's own svg animations stay untouched.
 */
function fitToSlot(host: HTMLElement) {
  const svg = host.querySelector("svg");
  const width = host.clientWidth;
  const height = host.clientHeight;
  if (!svg || !width || !height) return;
  const box = svg.getBBox();
  if (!box.width || !box.height) return;
  // px per stage unit (the svg letterboxes the stage into the slot)
  const unit = Math.min(width / 400, height / 320);
  const zoom = Math.min(
    FILL * Math.min(width / (box.width * unit), height / (box.height * unit)),
    MAX_ZOOM,
  );
  if (zoom <= 1) {
    host.style.transform = "";
    return;
  }
  const dx = (200 - (box.x + box.width / 2)) * unit;
  const dy = (160 - (box.y + box.height / 2)) * unit;
  host.style.transform = `scale(${zoom}) translate(${dx}px, ${dy}px)`;
}

/** Dots brighten one after another, like a wave passing through. */
function waveDots(svg: SVGSVGElement, delay = 0) {
  const dots = svg.querySelectorAll<SVGElement>(".dot");
  const step = Math.min(40, 900 / Math.max(dots.length, 1));
  dots.forEach((dot, i) => {
    dot.animate([{}, { fill: "var(--hl-hi)", opacity: 1, offset: 0.35 }, {}], {
      duration: 700,
      delay: delay + i * step,
      easing: EASE,
    });
  });
}

/** Dashed guides march in from nothing. */
function drawDashes(svg: SVGSVGElement, delay = 0) {
  svg.querySelectorAll<SVGElement>(".dash").forEach((dash, i) => {
    dash.animate(
      [
        { strokeDashoffset: 24, opacity: 0 },
        { strokeDashoffset: 0, opacity: 1 },
      ],
      {
        duration: 1100,
        delay: delay + i * 60,
        easing: EASE,
        fill: "backwards",
      },
    );
  });
}

/** The drawing assembles back to front (painter's order), each part lifting into place. */
function assemble(svg: SVGSVGElement) {
  const parts = svg.querySelectorAll<SVGElement>(
    ":scope > g path, :scope > g polygon, :scope > g ellipse, :scope > g line, :scope > g circle, :scope > path, :scope > polygon, :scope > ellipse, :scope > line, :scope > circle",
  );
  const n = Math.max(parts.length, 1);
  parts.forEach((part, i) => {
    part.animate(
      [
        { opacity: 0, transform: "translateY(5px)" },
        { opacity: 1, transform: "none" },
      ],
      {
        duration: 560,
        delay: (i / n) * 650,
        easing: EASE,
        fill: "backwards",
      },
    );
  });
  svg.animate(
    [
      { transform: "translateY(10px)", opacity: 0.6 },
      { transform: "none", opacity: 1 },
    ],
    { duration: 1100, easing: EASE },
  );
}

/** Decorative accent: hidden from assistive tech, follows the site theme. */
export function HairlineFigure({
  figure,
  className,
  intensity = 0.5,
  surface = "background",
  intro = true,
}: HairlineFigureProps) {
  const ref = useRef<HTMLDivElement>(null);
  const figureRef = useRef<Figure | null>(null);
  const intensityRef = useRef(intensity);
  intensityRef.current = intensity;

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    let disposed = false;
    let tourTimer = 0;
    let float: Animation | null = null;
    let observer: IntersectionObserver | null = null;
    const resize = new ResizeObserver(() => fitToSlot(host));
    const still = reducedMotion();

    const svg = () => host.querySelector("svg");

    const enter = (event: PointerEvent) => {
      if (still || event.pointerType === "touch") return;
      const el = svg();
      if (!el) return;
      waveDots(el);
      drawDashes(el);
      float?.cancel();
      float = el.animate(
        [
          { transform: "translateY(0)" },
          { transform: "translateY(-3px)" },
          { transform: "translateY(0)" },
        ],
        {
          duration: 3200,
          iterations: Number.POSITIVE_INFINITY,
          easing: "ease-in-out",
        },
      );
    };
    const leave = () => {
      float?.cancel();
      float = null;
    };

    loadFigure(figure)
      .then((mount) => {
        if (disposed) return;
        figureRef.current = mount(host, {
          intensity: intensityRef.current,
          theme: "auto",
        });
        fitToSlot(host);
        resize.observe(host);
        if (still || !intro) return;
        const el = svg();
        if (!el) return;
        // Hidden until it is first seen, then it builds itself.
        el.style.opacity = "0";
        observer = new IntersectionObserver(
          ([entry]) => {
            if (!entry?.isIntersecting) return;
            observer?.disconnect();
            el.style.opacity = "";
            assemble(el);
            drawDashes(el, 500);
            waveDots(el, 700);
            figureRef.current?.update({ play: true });
            tourTimer = window.setTimeout(
              () => figureRef.current?.update({ play: false }),
              TOUR_MS,
            );
          },
          { threshold: 0.35 },
        );
        observer.observe(host);
      })
      .catch(() => undefined);

    host.addEventListener("pointerenter", enter);
    host.addEventListener("pointerleave", leave);
    return () => {
      disposed = true;
      window.clearTimeout(tourTimer);
      observer?.disconnect();
      resize.disconnect();
      float?.cancel();
      host.removeEventListener("pointerenter", enter);
      host.removeEventListener("pointerleave", leave);
      figureRef.current?.destroy();
      figureRef.current = null;
    };
  }, [figure, intro]);

  useEffect(() => {
    figureRef.current?.update({ intensity });
  }, [intensity]);

  return (
    <div
      aria-hidden="true"
      className={cn(
        "transition-transform duration-500 hover:-translate-y-1 motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        "ease-[cubic-bezier(.32,.72,0,1)]",
        className,
      )}
      style={{ ...PALETTE, "--hl-surface": SURFACE[surface] } as CSSProperties}
    >
      <div ref={ref} className="size-full" />
    </div>
  );
}
