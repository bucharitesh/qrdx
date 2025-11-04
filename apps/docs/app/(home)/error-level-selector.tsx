"use client";

import { QRCodeSVG } from "qrdx";
import type React from "react";

type ErrorLevelSelectorProps = {
  selectedLevel?: string;
  onLevelSelect: (level: string) => void;
  qrColor?: string;
  backgroundColor?: string;
};

const errorLevels = [
  { id: "L", name: "Low", description: "~7%" },
  { id: "M", name: "Medium", description: "~15%" },
  { id: "Q", name: "Quartile", description: "~25%" },
  { id: "H", name: "High", description: "~30%" },
] as const;

export const ErrorLevelSelector: React.FC<ErrorLevelSelectorProps> = ({
  selectedLevel = "L",
  onLevelSelect,
  qrColor = "#000000",
  backgroundColor = "#ffffff",
}) => {
  return (
    <div className="grid grid-cols-4 gap-3">
      {errorLevels.map((level) => (
        <button
          className={`relative cursor-pointer rounded-lg border-2 p-3 transition-all hover:shadow-md ${
            selectedLevel === level.id
              ? "border-black bg-black/5"
              : "border-gray-200 bg-white hover:border-gray-300"
          }`}
          key={level.id}
          onClick={() => onLevelSelect(level.id)}
          tabIndex={0}
          type="button"
        >
          {/* Level Preview */}
          <div className="mb-2 flex items-center justify-center">
            <div className="flex h-16 w-16 items-center justify-center">
              <QRCodeSVG
                bgColor={backgroundColor}
                fgColor={qrColor}
                level={level.id}
                size={64}
                value="https://example.com"
              />
            </div>
          </div>

          {/* Level Name */}
          <p className="text-center text-gray-900 text-xs font-bold">
            {level.name}
          </p>
          <p className="text-center text-gray-500 text-[10px]">
            {level.description}
          </p>

          {/* Selection Indicator */}
          {selectedLevel === level.id && (
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
