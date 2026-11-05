"use client";

import { Label } from "@repo/design-system/components/ui/label";
import { Slider } from "@repo/design-system/components/ui/slider";
import { FRAME_FONT_SCALE_MAX, FRAME_FONT_SCALE_MIN } from "qrdx";
import { SolidColorField } from "@/components/editor/gradient-picker";

// Fields shared by the built-in and custom frame controls.

interface FrameColorFieldProps {
  id: string;
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (color: string) => void;
}

/**
 * A frame (or logo plate) color: the editor's paint picker, solid only.
 * Frame colors are stored as "#rrggbb", so it has no opacity.
 */
export function FrameColorField({
  id,
  label,
  value,
  disabled,
  onChange,
}: FrameColorFieldProps) {
  return (
    <SolidColorField
      disabled={disabled}
      id={id}
      label={label}
      onChange={onChange}
      value={value}
    />
  );
}

export function FrameTextSize({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs" htmlFor="frame-font-scale">
          Text size
        </Label>
        <span className="text-muted-foreground text-xs tabular-nums">
          {Math.round(value * 100)}%
        </span>
      </div>
      <Slider
        disabled={disabled}
        id="frame-font-scale"
        max={FRAME_FONT_SCALE_MAX}
        min={FRAME_FONT_SCALE_MIN}
        onValueChange={([next]) => onChange(next ?? 1)}
        step={0.05}
        value={[value]}
      />
    </div>
  );
}
