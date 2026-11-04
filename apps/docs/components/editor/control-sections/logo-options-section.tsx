"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Label } from "@repo/design-system/components/ui/label";
import { Slider } from "@repo/design-system/components/ui/slider";
import { Switch } from "@repo/design-system/components/ui/switch";
import { Gps } from "iconsax-reactjs";
import {
  AUTO_LEVEL_LOGO_COVERAGE,
  LOGO_PADDING_MAX,
  LOGO_SIZE_DEFAULT,
  LOGO_SIZE_MAX,
  LOGO_SIZE_MIN,
  type LogoOptions,
} from "qrdx/types";
import type * as React from "react";
import ControlSection from "@/components/editor/control-section";
import type { QRStyle } from "@/types/theme";
import { LOGO_SHAPE_NAMES, LogoCropControls } from "./logo-crop-controls";

const percent = (share: number) => Math.round(share * 100);

/** A labelled slider row: name on the left, value on the right. */
function SliderRow({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">{value}</span>
      </div>
      {children}
    </div>
  );
}

interface LogoOptionsSectionProps {
  /** The style with defaults filled in */
  style: QRStyle;
  onChange: (change: Partial<QRStyle>) => void;
}

/**
 * The logo's shape, plate and background, its size, clear space and
 * position, and automatic error correction. Shown while the logo is on.
 */
export function LogoOptionsSection({
  style,
  onChange,
}: LogoOptionsSectionProps) {
  const options = style.logoOptions ?? {};
  const size = options.size ?? LOGO_SIZE_DEFAULT;
  const padding = options.padding ?? 0;
  const x = options.x ?? 0.5;
  const y = options.y ?? 0.5;
  const centered = x === 0.5 && y === 0.5;

  const setOptions = (change: Partial<LogoOptions>) => {
    const next: LogoOptions = { ...options, ...change };
    for (const key of Object.keys(next) as (keyof LogoOptions)[]) {
      if (next[key] === undefined) delete next[key];
    }
    // Defaults are left out, so an untouched logo saves as before
    if (next.size === LOGO_SIZE_DEFAULT) delete next.size;
    if (next.padding === 0) delete next.padding;
    if (next.x === 0.5 && next.y === 0.5) {
      delete next.x;
      delete next.y;
    }
    onChange({
      logoOptions: Object.keys(next).length > 0 ? next : undefined,
    });
  };

  const shape = options.shape ?? "square";

  return (
    <ControlSection
      id="section-logo-options"
      summary={[
        `${percent(size)}%`,
        shape !== "square" && LOGO_SHAPE_NAMES[shape].toLowerCase(),
        !centered && "moved",
      ]
        .filter(Boolean)
        .join(" · ")}
      title="Logo options"
    >
      <LogoCropControls
        onChange={onChange}
        setOptions={setOptions}
        style={style}
      />

      <SliderRow label="Size" value={`${percent(size)}% of the code`}>
        <Slider
          aria-label="Logo size"
          max={percent(LOGO_SIZE_MAX)}
          min={percent(LOGO_SIZE_MIN)}
          onValueChange={([next]) =>
            setOptions({ size: (next ?? percent(LOGO_SIZE_DEFAULT)) / 100 })
          }
          step={1}
          value={[percent(size)]}
        />
      </SliderRow>

      <SliderRow
        label="Clear space"
        value={`${padding} ${padding === 1 ? "module" : "modules"}`}
      >
        <Slider
          aria-label="Clear space around the logo"
          max={LOGO_PADDING_MAX}
          min={0}
          onValueChange={([next]) => setOptions({ padding: next ?? 0 })}
          step={1}
          value={[padding]}
        />
      </SliderRow>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground text-sm">Position</span>
          <Button
            disabled={centered}
            onClick={() => setOptions({ x: 0.5, y: 0.5 })}
            size="sm"
            type="button"
            variant="outline"
          >
            <Gps />
            Center
          </Button>
        </div>
        <SliderRow label="Left to right" value={`${percent(x)}%`}>
          <Slider
            aria-label="Logo position, left to right"
            max={100}
            min={0}
            onValueChange={([next]) => setOptions({ x: (next ?? 50) / 100 })}
            step={1}
            value={[percent(x)]}
          />
        </SliderRow>
        <SliderRow label="Top to bottom" value={`${percent(y)}%`}>
          <Slider
            aria-label="Logo position, top to bottom"
            max={100}
            min={0}
            onValueChange={([next]) => setOptions({ y: (next ?? 50) / 100 })}
            step={1}
            value={[percent(y)]}
          />
        </SliderRow>
        <p className="text-muted-foreground text-xs text-pretty">
          Keep the logo off the three corner eyes and the small square near the
          bottom-right corner. The scan score warns when it covers one.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="space-y-0.5">
          <Label className="cursor-pointer text-sm" htmlFor="logo-auto-level">
            Raise error correction for big logos
          </Label>
          <p className="text-muted-foreground text-xs">
            Switches to level H when the logo covers more than{" "}
            {percent(AUTO_LEVEL_LOGO_COVERAGE)}% of the code.
          </p>
        </div>
        <Switch
          checked={style.autoLevel ?? false}
          id="logo-auto-level"
          onCheckedChange={(value) =>
            onChange({ autoLevel: value ? true : undefined })
          }
        />
      </div>
    </ControlSection>
  );
}
