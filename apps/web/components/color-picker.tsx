import { useState } from "react";
import { HexColorPicker } from "react-colorful";
import { Input } from "@/components/ui/input";
import {
  FormControl,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useOutsideClick } from "@/lib/hooks/use-outside-click";

interface ColorFieldProps {
  color: string;
  onChange: (color: string) => void;
  label?: string;
  error?: string;
  showLabel?: boolean;
}

export const ColorInput = ({
  color,
  onChange,
  label,
  error,
  showLabel = true,
}: ColorFieldProps) => {
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useOutsideClick(() => setShowPicker(false));

  const handleColorChange = (newColor: string) => {
    const cleanedColor = newColor.replace(/\s+/g, "").replace(/^#+/g, "");

    const formattedColor = `#${cleanedColor}`;

    onChange(formattedColor);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleColorChange(e.currentTarget.value);
    }
  };

  return (
    <FormItem className="flex flex-col gap-0">
      {showLabel && (
        <FormLabel className="flex items-center gap-1 peer-disabled:opacity-70 w-max text-sm font-medium text-gray-700">
          {label}
        </FormLabel>
      )}
      <FormControl>
        <div className="flex gap-1 items-center rounded-xl border border-black/8 shadow-sm px-2 py-1">
          <div className="relative" ref={pickerRef}>
            <div
              className="border border-black min-w-7 h-7  rounded-lg cursor-pointer"
              style={{ backgroundColor: color }}
              onClick={() => setShowPicker(true)}
            />
            {showPicker && (
              <HexColorPicker
                style={{
                  position: "absolute",
                  bottom: "-205px",
                  left: "10px",
                  zIndex: 1,
                }}
                color={color}
                onChange={handleColorChange}
              />
            )}
          </div>
          <Input
            className="w-full rounded-xl border-none shadow-none outline-none focus-visible:ring-0 focus-visible:border-0 focus-visible:outline-0 focus:outline-none focus:border-none focus:ring-0 focus:ring-transparent active:border-none active:outline-none active:ring-0 active:ring-transparent !focus:outline-none !focus:border-none !focus:ring-0"
            style={{ outline: "none", border: "none", boxShadow: "none" }}
            value={color}
            onChange={(e) => onChange(e.target.value)}
            onBlur={(e) => handleColorChange(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e)}
            placeholder="#000000"
            maxLength={8}
          />
        </div>
      </FormControl>
      {error && <FormMessage>{error}</FormMessage>}
    </FormItem>
  );
};
