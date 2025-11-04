"use client";

import { QRCodeSVG } from "qrdx";
import type React from "react";

type PatternSelectorProps = {
  selectedPattern?: string;
  onPatternSelect: (pattern: string) => void;
  qrColor?: string;
  backgroundColor?: string;
};

const patterns = [
  { id: "circle", name: "Circle" },
  { id: "square", name: "Square" },
  { id: "diamond", name: "Diamond" },
  { id: "circle-mixed", name: "Mixed" },
  { id: "pacman", name: "Pacman" },
  { id: "rounded", name: "Rounded" },
  { id: "clean-square", name: "Clean" },
] as const;

export const PatternSelector: React.FC<PatternSelectorProps> = ({
  selectedPattern = "circle",
  onPatternSelect,
  qrColor = "#000000",
  backgroundColor = "#ffffff",
}) => {
  return (
    <div className="grid grid-cols-4 gap-3">
      {patterns.map((pattern) => (
        <button
          className={`relative cursor-pointer rounded-lg border-2 p-3 transition-all hover:shadow-md ${
            selectedPattern === pattern.id
              ? "border-black bg-black/5"
              : "border-gray-200 bg-white hover:border-gray-300"
          }`}
          key={pattern.id}
          onClick={() => onPatternSelect(pattern.id)}
          tabIndex={0}
          type="button"
        >
          {/* Pattern Preview */}
          <div className="mb-2 flex items-center justify-center">
            <div className="flex h-16 w-16 items-center justify-center">
              <QRCodeSVG
                bgColor={backgroundColor}
                dotPattern={
                  pattern.id as
                    | "circle"
                    | "square"
                    | "diamond"
                    | "circle-mixed"
                    | "pacman"
                    | "rounded"
                    | "clean-square"
                }
                fgColor={qrColor}
                size={64}
                value="https://example.com"
              />
            </div>
          </div>

          {/* Pattern Name */}
          <p className="text-center text-gray-700 text-xs font-medium">
            {pattern.name}
          </p>

          {/* Selection Indicator */}
          {selectedPattern === pattern.id && (
            <div className="absolute top-2 right-2">
              <div className="flex h-4 w-4 items-center justify-center rounded-full bg-black">
                <span className="font-bold text-white text-[10px]">✓</span>
              </div>
            </div>
          )}
        </button>
      ))}
    </div>
  );
};
