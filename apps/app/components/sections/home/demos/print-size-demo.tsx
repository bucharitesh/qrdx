"use client";

import { animate, useInView, useReducedMotion } from "motion/react";
import { QRCodeSVG } from "qrdx";
import { useEffect, useId, useRef, useState } from "react";
import { EASE, EASE_CLASS } from "@/components/mockups/motion";
import {
  calculatePrintSize,
  getMinVersion,
  mmToInches,
  modulesForVersion,
} from "@/lib/print-size";
import { HOME_CODES } from "./codes";
import { ControlBar, Readout } from "./demo-ui";

const CODE = HOME_CODES.printSize;
const MODULES = modulesForVersion(
  getMinVersion(CODE.value, CODE.level ?? "Q") ?? 2,
);
const MIN_M = 0.2;
const MAX_M = 5;
const MAX_SYMBOL_MM = calculatePrintSize({
  distanceMm: MAX_M * 1000,
  modules: MODULES,
}).symbolMm;

/** The code's inset from the paper's edge, as a share of the dashed square. */
const PAPER_INSET = 0.04;

const format = (mm: number) =>
  mm >= 100 ? `${(mm / 10).toFixed(0)} cm` : `${(mm / 10).toFixed(1)} cm`;

/** Drag the scanning distance; the minimum print size follows (same maths as the calculator). */
export function PrintSizeDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const reduce = useReducedMotion();
  const id = useId();
  const [meters, setMeters] = useState(1.5);
  const touched = useRef(false);

  // On first view, walk back from arm's length to 1.5 m so the code grows.
  useEffect(() => {
    if (!inView || reduce || touched.current) return;
    const controls = animate(0.4, 1.5, {
      duration: 1.4,
      ease: EASE,
      delay: 0.2,
      onUpdate: (v) => {
        if (!touched.current) setMeters(Math.round(v * 10) / 10);
      },
    });
    return () => controls.stop();
  }, [inView, reduce]);

  const { symbolMm } = calculatePrintSize({
    distanceMm: meters * 1000,
    modules: MODULES,
  });
  // Square-root scale keeps small sizes visible; the text gives exact numbers.
  const scale = Math.max(Math.sqrt(symbolMm / MAX_SYMBOL_MM), 0.16);

  return (
    <div ref={ref} className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 items-center justify-between gap-4 px-5 sm:gap-6 sm:px-8">
        <p className="flex min-w-0 flex-col gap-1">
          <Readout>minimum width</Readout>
          <span className="whitespace-nowrap text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">
            {format(symbolMm)}
          </span>
          <span className="text-sm text-muted-foreground tabular-nums">
            {mmToInches(symbolMm).toFixed(1)} in
          </span>
        </p>
        {/* The dashed square is the size needed from the slider's far end
            (5 m); the code grows into it from the bottom-left corner. It is
            scaled, not resized: changing its width moved its top edge, a
            layout shift on every frame of the first-view animation. The
            paper's corners, ring and shadow are divided by the scale so they
            draw at the same size as before, and the code sits a fixed 4% of
            the square in from the paper's edge, as its padding did. */}
        <div
          aria-hidden="true"
          className="relative size-28 shrink-0 rounded-[8px] border border-dashed border-foreground/20 sm:size-44"
        >
          <div
            className={`absolute inset-0 origin-bottom-left bg-white transition-[scale,border-radius,box-shadow] duration-200 motion-reduce:transition-none ${EASE_CLASS}`}
            style={{
              scale: `${scale}`,
              borderRadius: `${6 / scale}px`,
              boxShadow: `0 0 0 ${1 / scale}px rgba(0,0,0,0.1), 0 ${8 / scale}px ${20 / scale}px ${-12 / scale}px rgba(0,0,0,0.35)`,
            }}
          />
          <div
            className={`absolute bottom-[4%] left-[4%] aspect-square w-[92%] origin-bottom-left transition-[scale] duration-200 motion-reduce:transition-none [&_svg]:size-full ${EASE_CLASS}`}
            style={{
              scale: `${(scale - 2 * PAPER_INSET) / (1 - 2 * PAPER_INSET)}`,
            }}
          >
            <QRCodeSVG {...CODE} />
          </div>
        </div>
      </div>
      <ControlBar>
        <label htmlFor={id} className="shrink-0">
          <Readout>distance</Readout>
        </label>
        <input
          id={id}
          type="range"
          min={MIN_M}
          max={MAX_M}
          step={0.1}
          value={meters}
          aria-valuetext={`${meters.toFixed(1)} meters: at least ${format(symbolMm)} wide`}
          onChange={(event) => {
            touched.current = true;
            setMeters(Number(event.target.value));
          }}
          className="h-1.5 min-w-0 flex-1 cursor-pointer accent-foreground"
        />
        <Readout className="w-12 shrink-0 text-right text-foreground">
          {meters.toFixed(1)} m
        </Readout>
      </ControlBar>
    </div>
  );
}
