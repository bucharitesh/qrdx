"use client";

import { Slider } from "@repo/design-system/components/ui/slider";
import { MODULE_SCALE_FLOOR } from "qrdx";
import ControlSection from "@/components/editor/control-section";
import type { QRStyle } from "@/types/theme";
import { patternName } from "./pattern-controls";

const STEP = 5;

interface DotSizeSectionProps {
  /** The style with defaults filled in */
  style: QRStyle;
  onChange: (moduleScale: number | undefined) => void;
}

/**
 * Size of each data dot (moduleScale). Every dot shape stops at the
 * smallest size it still scans at, so the range depends on the shape.
 */
export function DotSizeSection({ style, onChange }: DotSizeSectionProps) {
  const pattern = style.bodyPattern ?? "circle";
  const floor = Math.round((MODULE_SCALE_FLOOR[pattern] ?? 1) * 100);
  const value = Math.max(floor, Math.round((style.moduleScale ?? 1) * 100));
  const fixed = floor >= 100;

  return (
    <ControlSection
      id="section-dot-size"
      summary={`${value}%`}
      title="Dot size"
    >
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Size of each dot</span>
          <span className="tabular-nums">{value}%</span>
        </div>
        <Slider
          aria-label="Dot size"
          disabled={fixed}
          max={100}
          min={fixed ? 99 : floor}
          onValueChange={([next]) => {
            const scale = (next ?? 100) / 100;
            onChange(scale >= 1 ? undefined : scale);
          }}
          step={fixed ? 1 : Math.min(STEP, 100 - floor)}
          value={[value]}
        />
      </div>
      <p className="text-muted-foreground text-xs text-pretty">
        {fixed
          ? `${patternName(pattern)} dots keep their full size: smaller ones stop scanning.`
          : `Smaller dots give a lighter look. ${patternName(pattern)} dots go down to ${floor}%, the smallest size that still scans.`}
      </p>
    </ControlSection>
  );
}
