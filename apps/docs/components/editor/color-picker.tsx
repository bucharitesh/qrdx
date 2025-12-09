"use client";

import { Label } from "@repo/design-system/components/ui/label";
import { Input } from "@repo/design-system/components/ui/input";
import { cn } from "@repo/design-system/lib/utils";
import React, { useCallback, useEffect, useRef, useState } from "react";

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  label: string;
  name?: string;
}

export function ColorPicker({ color, onChange, label, name }: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const textInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Update the text input value using ref when color prop changes
    if (textInputRef.current) {
      textInputRef.current.value = color;
    }
  }, [color]);

  const handleColorChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newColor = e.target.value;
      onChange(newColor);
    },
    [onChange]
  );

  const handleTextInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const colorString = e.target.value;
      onChange(colorString);
    },
    [onChange]
  );

  return (
    <div className="mb-3">
      <div className="mb-1.5 flex items-center justify-between">
        <Label
          htmlFor={`color-${label.replace(/\s+/g, "-").toLowerCase()}`}
          className="text-xs font-medium"
        >
          {label}
        </Label>
      </div>
      <div className="relative flex items-center gap-1">
        <div
          className="relative flex h-8 w-8 cursor-pointer items-center justify-center overflow-hidden rounded border"
          style={{ backgroundColor: color }}
          onClick={() => setIsOpen(!isOpen)}
        >
          <input
            type="color"
            id={`color-${label.replace(/\s+/g, "-").toLowerCase()}`}
            value={color}
            onChange={handleColorChange}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>
        <Input
          ref={textInputRef}
          type="text"
          defaultValue={color}
          onChange={handleTextInputChange}
          className="bg-input/25 border-border/20 h-8 flex-1 rounded border px-2 text-sm"
          placeholder="Enter color (hex)"
        />
      </div>
    </div>
  );
}




