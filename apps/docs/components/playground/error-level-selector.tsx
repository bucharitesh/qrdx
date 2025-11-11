"use client";

import { QRCodeSVG } from "qrdx";
import type { ErrorLevel } from "qrdx/types";
import type React from "react";
import { useQRStore } from "../../lib/qr-store";

const errorLevels: Array<{
  id: ErrorLevel;
  name: string;
  description: string;
}> = [
  { id: "L", name: "Low", description: "~7%" },
  { id: "M", name: "Medium", description: "~15%" },
  { id: "Q", name: "Quartile", description: "~25%" },
  { id: "H", name: "High", description: "~30%" },
] as const;

export const ErrorLevelSelector: React.FC = () => {
  const { qrStyles, updateQrStyle } = useQRStore();
  const selectedLevel = qrStyles.level || "L";
  return (
    <div className="grid grid-cols-4 gap-3">
      {errorLevels.map((level) => (
        <button
          className={`relative cursor-pointer rounded-lg ring-2 p-3 transition-all hover:shadow-md ${
            selectedLevel === level.id
              ? "bg-black/5 ring-blue-400 dark:bg-white"
              : "ring-gray-200 bg-white hover:ring-gray-300"
          }`}
          key={level.id}
          onClick={() =>
            updateQrStyle("level", level.id as typeof qrStyles.level)
          }
          tabIndex={0}
          type="button"
        >
          {/* Level Preview */}
          <div className="mb-2 flex items-center justify-center">
            <div className="flex h-16 w-16 items-center justify-center">
              <QRCodeSVG
                bgColor={"transparent"}
                fgColor={"#000000"}
                level={level.id}
                size={64}
                value="https://example.com"
              />
            </div>
          </div>

          {/* Level Name */}
          <p className="text-center text-black text-xs font-bold">
            {level.name}
          </p>
          <p className="text-center text-black text-[10px]">
            {level.description}
          </p>

          {/* Selection Indicator */}
          {selectedLevel === level.id && (
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
