"use client";

import type { CornerEyePattern } from "qrdx/types";
import type React from "react";
import { useQREditorStore } from "@/store/editor-store";
import { EyePatterns } from "../icons/eye-patterns";

export const patterns: Array<{ id: CornerEyePattern; name: string }> = [
  { id: "square", name: "Square" },
  { id: "rounded", name: "Rounded" },
  { id: "circle", name: "Circle" },
  { id: "gear", name: "Gear" },
  { id: "diya", name: "Diya" },
  { id: "extra-rounded", name: "Extra Rounded" },
  { id: "message", name: "Message" },
  { id: "pointy", name: "Pointy" },
  { id: "curly", name: "Curly" },
] as const;

export const CornerEyePatternSelector: React.FC = () => {
  const { themeState, setThemeState } = useQREditorStore();
  const style = themeState.styles;
  const selectedPattern = style.cornerEyePattern;
  return (
    <div className="grid grid-cols-4 gap-3">
      {patterns.map((pattern) => (
        <button
          className={`relative cursor-pointer rounded-lg ring-2 p-3 transition-all hover:shadow-md ${
            selectedPattern === pattern.id
              ? "bg-black/5 ring-blue-400 dark:bg-white"
              : "ring-gray-200 bg-white hover:ring-gray-300"
          }`}
          key={pattern.id}
          onClick={() =>
            setThemeState({
              ...themeState,
              styles: { ...style, cornerEyePattern: pattern.id },
            })
          }
          tabIndex={0}
          type="button"
        >
          {/* Pattern Preview */}
          <div className="mb-2 flex items-center justify-center">
            <div className="flex h-16 w-16 items-center justify-center">
              <EyePatterns pattern={pattern.id} />
            </div>
          </div>

          {/* Pattern Name */}
          <p className="text-center text-black text-xs font-medium">
            {pattern.name}
          </p>

          {/* Selection Indicator */}
          {selectedPattern === pattern.id && (
            <div className="absolute top-2 right-2">
              <div className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-400">
                <span className="font-bold text-white text-[10px]">✓</span>
              </div>
            </div>
          )}
        </button>
      ))}
    </div>
  );
};
