"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { useOutsideClick } from "@repo/design-system/hooks/use-outside-click";
import React, { useState } from "react";
import { HexColorPicker } from "react-colorful";

type ColorFieldProps = {
  color: string;
  onChange: (color: string) => void;
  label?: string;
  error?: string;
  showLabel?: boolean;
};

export const ColorInput = ({
  color,
  onChange,
  label,
  error,
  showLabel = true,
}: ColorFieldProps) => {
  const [showPicker, setShowPicker] = useState(false);
  const [inputValue, setInputValue] = useState(color);
  const pickerRef = useOutsideClick(() => setShowPicker(false));

  // Update input value when color prop changes
  React.useEffect(() => {
    setInputValue(color);
  }, [color]);

  const handleColorChange = (newColor: string) => {
    // Remove any spaces and ensure it starts with #
    let cleanedColor = newColor.trim();

    if (!cleanedColor.startsWith("#")) {
      cleanedColor = `#${cleanedColor.replace(/^#+/g, "")}`;
    }

    // Validate hex color format
    const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    if (hexRegex.test(cleanedColor)) {
      onChange(cleanedColor);
      setInputValue(cleanedColor);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);

    // Only update parent if valid
    if (value.match(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)) {
      onChange(value);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleColorChange(inputValue);
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-2">
      {showLabel && (
        <div className="font-medium text-gray-700 text-sm">{label}</div>
      )}
      <div>
        <div className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 shadow-sm transition-all focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-200 hover:border-gray-400">
          <div className="relative h-full" ref={pickerRef}>
            <button
              aria-label="Open color picker"
              className="h-8 w-8 shrink-0 cursor-pointer rounded border-2 border-gray-300 transition-colors hover:border-gray-400"
              onClick={() => setShowPicker(!showPicker)}
              style={{ backgroundColor: color }}
              type="button"
            />
            {showPicker && (
              <div className="absolute top-full left-0 z-50 mt-2 rounded-lg shadow-xl">
                <HexColorPicker color={color} onChange={onChange} />
              </div>
            )}
          </div>
          <Input
            className="flex-1 border-0 bg-transparent p-0 font-mono text-gray-900 text-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
            maxLength={7}
            onBlur={(e) => handleColorChange(e.target.value)}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="#000000"
            value={inputValue}
          />
        </div>
      </div>
      {error && <div>{error}</div>}
    </div>
  );
};
