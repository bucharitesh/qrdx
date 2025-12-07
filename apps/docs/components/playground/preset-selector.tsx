"use client";

import { QRCodeSVG } from "qrdx";
import type React from "react";
import { useQREditorStore } from "@/store/editor-store";
import { defaultPresets } from "@/utils/qr-presets";

export const PresetSelector: React.FC = () => {
  const { themeState, applyThemePreset } = useQREditorStore();

  const presets = Object.entries(defaultPresets).map(([id, preset]) => ({
    id,
    name: preset.label || id,
    style: preset.styles,
    source: preset.source || "BUILT_IN",
  }));

  return (
    <div className="space-y-4">
      <h2 className="font-semibold text-lg">Presets</h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {presets.map((preset) => {
          const isSelected = themeState.preset === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              className={`group relative cursor-pointer rounded-lg border-2 p-4 transition-all hover:shadow-lg ${
                isSelected
                  ? "border-blue-500 bg-blue-50/50 ring-2 ring-blue-200 dark:bg-blue-950/20"
                  : "border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900"
              }`}
              onClick={() => applyThemePreset(preset.id)}
            >
              {/* Preview */}
              <div className="mb-3 flex items-center justify-center rounded-md bg-gray-50 p-4 dark:bg-gray-800">
                <QRCodeSVG
                  bgColor={preset.style.bgColor || "#ffffff"}
                  fgColor={preset.style.fgColor || "#000000"}
                  eyeColor={preset.style.eyeColor}
                  dotColor={preset.style.dotColor}
                  bodyPattern={preset.style.bodyPattern}
                  cornerEyePattern={preset.style.cornerEyePattern}
                  cornerEyeDotPattern={preset.style.cornerEyeDotPattern}
                  level={preset.style.level}
                  size={96}
                  value="https://example.com"
                />
              </div>

              {/* Name */}
              <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                {preset.name}
              </h3>

              {/* Selection Indicator */}
              {isSelected && (
                <div className="absolute top-2 right-2 pointer-events-none">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500">
                    <span className="font-bold text-white text-sm">✓</span>
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
