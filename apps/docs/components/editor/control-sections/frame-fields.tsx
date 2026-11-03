"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/design-system/components/ui/popover";
import { Slider } from "@repo/design-system/components/ui/slider";
import { FRAME_FONT_SCALE_MAX, FRAME_FONT_SCALE_MIN } from "qrdx";
import { useEffect, useState } from "react";
import { HexColorPicker } from "react-colorful";

// Fields shared by the built-in and custom frame controls.

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

interface FrameColorFieldProps {
  id: string;
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (color: string) => void;
}

export function FrameColorField({
  id,
  label,
  value,
  disabled,
  onChange,
}: FrameColorFieldProps) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <div className="space-y-1.5">
      <Label className="text-xs" htmlFor={id}>
        {label}
      </Label>
      <div className="flex items-center gap-2">
        <Popover>
          <PopoverTrigger asChild disabled={disabled}>
            <button
              aria-label={`Pick ${label.toLowerCase()}`}
              className="size-9 shrink-0 rounded-full border shadow-xs disabled:opacity-50"
              style={{ backgroundColor: value }}
              type="button"
            />
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3">
            <HexColorPicker color={value} onChange={onChange} />
          </PopoverContent>
        </Popover>
        <Input
          className="flex-1 font-mono text-sm"
          disabled={disabled}
          id={id}
          maxLength={7}
          onBlur={() => setDraft(value)}
          onChange={(event) => {
            setDraft(event.target.value);
            if (HEX_COLOR.test(event.target.value)) {
              onChange(event.target.value);
            }
          }}
          placeholder="#000000"
          value={draft}
        />
      </div>
    </div>
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
