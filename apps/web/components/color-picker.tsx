import { useState } from "react";
import { HexColorPicker } from "react-colorful";
import {
  FormControl,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useOutsideClick } from "@/lib/hooks/use-outside-click";

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
        <FormLabel className="flex w-max items-center gap-1 font-medium text-gray-700 text-sm peer-disabled:opacity-70">
          {label}
        </FormLabel>
      )}
      <FormControl>
        <div className="flex items-center gap-1 rounded-xl border border-black/8 px-2 py-1 shadow-sm">
          <div className="relative" ref={pickerRef}>
            <button
              className="h-7 min-w-7 cursor-pointer rounded-lg border border-black"
              onClick={() => setShowPicker(true)}
              style={{ backgroundColor: color }}
              type="button"
            />
            {showPicker && (
              <HexColorPicker
                color={color}
                onChange={handleColorChange}
                style={{
                  position: "absolute",
                  bottom: "-205px",
                  left: "10px",
                  zIndex: 1,
                }}
              />
            )}
          </div>
          <Input
            className="w-full rounded-xl !focus:border-none border-none shadow-none !focus:outline-none outline-none !focus:ring-0 focus:border-none focus:outline-none focus:ring-0 focus:ring-transparent focus-visible:border-0 focus-visible:outline-0 focus-visible:ring-0 active:border-none active:outline-none active:ring-0 active:ring-transparent"
            maxLength={8}
            onBlur={(e) => handleColorChange(e.target.value)}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e)}
            placeholder="#000000"
            style={{ outline: "none", border: "none", boxShadow: "none" }}
            value={color}
          />
        </div>
      </FormControl>
      {error && <FormMessage>{error}</FormMessage>}
    </FormItem>
  );
};
