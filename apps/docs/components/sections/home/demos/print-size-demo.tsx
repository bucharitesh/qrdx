"use client";

import { Label } from "@repo/design-system/components/ui/label";
import { Slider } from "@repo/design-system/components/ui/slider";
import { Smartphone } from "lucide-react";
import { QRCode } from "qrdx";
import { useState } from "react";
import { EASE_CLASS } from "@/components/mockups/motion";
import {
  calculatePrintSize,
  getMinVersion,
  mmToInches,
  modulesForVersion,
} from "@/lib/print-size";

const CONTENT = "https://qrdx.dev";
const MODULES = modulesForVersion(getMinVersion(CONTENT, "Q") ?? 2);
const MIN_M = 0.2;
const MAX_M = 5;
const MAX_SYMBOL_MM = calculatePrintSize({
  distanceMm: MAX_M * 1000,
  modules: MODULES,
}).symbolMm;

const format = (mm: number) =>
  mm >= 100 ? `${(mm / 10).toFixed(0)} cm` : `${(mm / 10).toFixed(1)} cm`;

/** Drag the scanning distance; the minimum print size follows (same maths as the calculator). */
export function PrintSizeDemo() {
  const [meters, setMeters] = useState(1);
  const { symbolMm } = calculatePrintSize({
    distanceMm: meters * 1000,
    modules: MODULES,
  });
  // Square-root scale keeps small sizes visible; the text gives exact numbers.
  const scale = Math.max(Math.sqrt(symbolMm / MAX_SYMBOL_MM), 0.12);

  return (
    <div className="flex h-full flex-col justify-center gap-5">
      <div className="flex h-40 items-end gap-3" aria-hidden="true">
        <Smartphone className="mb-1 size-6 shrink-0 text-muted-foreground" />
        <div className="mb-3.5 h-px flex-1 border-t border-dashed border-muted-foreground/40" />
        <div className="flex size-40 shrink-0 items-end justify-center">
          <div
            className={`aspect-square rounded-[3px] bg-white ring-1 ring-black/10 transition-[width] duration-200 [&_svg]:size-full ${EASE_CLASS}`}
            style={{ width: `${scale * 100}%` }}
          >
            <QRCode value={CONTENT} size={160} level="Q" margin={0} hideLogo />
          </div>
        </div>
      </div>
      <p className="text-sm" aria-live="polite">
        Print at least{" "}
        <span className="font-semibold tabular-nums">{format(symbolMm)}</span>{" "}
        <span className="text-muted-foreground tabular-nums">
          ({mmToInches(symbolMm).toFixed(1)} in)
        </span>{" "}
        wide to scan from{" "}
        <span className="font-semibold tabular-nums">
          {meters.toFixed(1)} m
        </span>
        .
      </p>
      <div className="flex flex-col gap-2.5">
        <Label htmlFor="print-demo-distance" className="text-xs">
          Scanning distance
        </Label>
        <Slider
          id="print-demo-distance"
          min={MIN_M}
          max={MAX_M}
          step={0.1}
          value={[meters]}
          onValueChange={([next]) => setMeters(next ?? 1)}
          aria-label="Scanning distance in meters"
        />
      </div>
    </div>
  );
}
