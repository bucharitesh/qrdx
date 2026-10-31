"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Slider } from "@repo/design-system/components/ui/slider";

const MAX_PADDING = 10;

const PRESETS = [
  { label: "None", value: 0 },
  { label: "Small", value: 2 },
  { label: "Standard", value: 4 },
  { label: "Large", value: 8 },
];

interface PaddingControlsProps {
  value: number | undefined;
  onChange: (value: number) => void;
}

export function PaddingControls({ value = 0, onChange }: PaddingControlsProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Quiet zone around the code
        </span>
        <span className="tabular-nums">
          {value} {value === 1 ? "module" : "modules"}
        </span>
      </div>
      <Slider
        aria-label="Padding"
        max={MAX_PADDING}
        min={0}
        onValueChange={([next]) => onChange(next ?? 0)}
        step={1}
        value={[value]}
      />
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => (
          <Button
            key={preset.value}
            onClick={() => onChange(preset.value)}
            size="sm"
            type="button"
            variant={value === preset.value ? "secondary" : "outline"}
          >
            {preset.label}
          </Button>
        ))}
      </div>
      <p className="text-muted-foreground text-xs">
        Scanners need a blank border around the code. Use 4 modules (the QR
        standard) when printing on busy or dark backgrounds.
      </p>
    </div>
  );
}
