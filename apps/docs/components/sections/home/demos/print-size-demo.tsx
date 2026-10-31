"use client";

import { cn } from "@repo/design-system/lib/utils";
import { Mobile } from "iconsax-reactjs";
import { animate, useInView, useReducedMotion } from "motion/react";
import { QRCode } from "qrdx";
import { useEffect, useId, useRef, useState } from "react";
import { EASE, EASE_CLASS } from "@/components/mockups/motion";
import { easterEggUrl } from "@/lib/easter-eggs";
import {
  calculatePrintSize,
  getMinVersion,
  mmToInches,
  modulesForVersion,
} from "@/lib/print-size";
import { DemoStage, Readout } from "./demo-ui";
import { FAMILY } from "./qr-family";

const CONTENT = easterEggUrl("print");
const MODULES = modulesForVersion(getMinVersion(CONTENT, "Q") ?? 2);
const MIN_M = 0.2;
const MAX_M = 5;
const MAX_SYMBOL_MM = calculatePrintSize({
  distanceMm: MAX_M * 1000,
  modules: MODULES,
}).symbolMm;

const format = (mm: number) =>
  mm >= 100 ? `${(mm / 10).toFixed(0)} cm` : `${(mm / 10).toFixed(1)} cm`;

/** Ruler ticks every half metre along the dimension line. */
const TICKS = Array.from({ length: MAX_M * 2 + 1 }, (_, i) => i / 2);

/** Drag the scanning distance; the minimum print size follows (same maths as the calculator). */
export function PrintSizeDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const reduce = useReducedMotion();
  const id = useId();
  const [meters, setMeters] = useState(1);
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
  const scale = Math.max(Math.sqrt(symbolMm / MAX_SYMBOL_MM), 0.14);
  const pos = meters / MAX_M;

  return (
    <div ref={ref} className="flex h-full flex-col">
      <DemoStage
        pattern="ramp"
        className="flex flex-1 flex-col justify-center gap-5 px-5 sm:px-6"
      >
        <div className="flex h-36 items-end gap-3" aria-hidden="true">
          <div className="flex shrink-0 flex-col items-center gap-1 pb-0.5">
            <Mobile variant="Bulk" className="size-7 text-foreground/70" />
          </div>
          <div className="relative mb-3.5 flex-1">
            <div className="h-px bg-foreground/25" />
            {TICKS.map((t) => (
              <span
                key={t}
                className={cn(
                  "absolute top-0 w-px -translate-x-1/2 bg-foreground/25",
                  t % 1 === 0 ? "h-2" : "h-1",
                )}
                style={{ left: `${(t / MAX_M) * 100}%` }}
              />
            ))}
            <span
              className={`absolute -top-1 size-2 -translate-x-1/2 rounded-full bg-foreground transition-[left] duration-200 ${EASE_CLASS}`}
              style={{ left: `${pos * 100}%` }}
            />
            <span
              className={`absolute -top-6 -translate-x-1/2 rounded-full border bg-background px-1.5 font-mono text-[10px] tabular-nums transition-[left] duration-200 ${EASE_CLASS}`}
              style={{ left: `${pos * 100}%` }}
            >
              {meters.toFixed(1)} m
            </span>
          </div>
          <div className="flex size-28 shrink-0 items-end justify-center sm:size-36">
            <div
              className={`aspect-square rounded-[6px] bg-white p-[4%] shadow-[0_10px_24px_-12px_rgba(0,0,0,0.35)] ring-1 ring-black/10 transition-[width] duration-200 [&_svg]:size-full ${EASE_CLASS}`}
              style={{ width: `${scale * 100}%` }}
            >
              <QRCode
                value={CONTENT}
                size={144}
                level="Q"
                margin={0}
                hideLogo
                fgColor={FAMILY.fgColor}
                eyeColor={FAMILY.eyeColor}
                dotColor={FAMILY.dotColor}
                bodyPattern={FAMILY.bodyPattern}
                cornerEyePattern={FAMILY.cornerEyePattern}
                cornerEyeDotPattern={FAMILY.cornerEyeDotPattern}
              />
            </div>
          </div>
        </div>
        <p className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
          <span className="whitespace-nowrap text-3xl font-semibold tracking-tight tabular-nums">
            {format(symbolMm)}
          </span>
          <span className="text-sm text-muted-foreground">
            minimum width ({mmToInches(symbolMm).toFixed(1)} in) to scan from{" "}
            {meters.toFixed(1)} m
          </span>
        </p>
      </DemoStage>
      <div className="flex items-center gap-3 border-t px-4 py-3">
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
          onChange={(event) => {
            touched.current = true;
            setMeters(Number(event.target.value));
          }}
          className="h-1.5 flex-1 cursor-pointer accent-foreground"
        />
        <Readout className="w-12 text-right">{meters.toFixed(1)} m</Readout>
      </div>
    </div>
  );
}
