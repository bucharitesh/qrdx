"use client";

import { QRCodeSVG } from "qrdx";
import type React from "react";
import { useQREditorStore } from "@/store/editor-store";

const variants: Array<{ id: "default" | "logo_qr"; name: string; description: string }> = [
  {
    id: "default",
    name: "Default QR",
    description: "Traditional QR with customizable colors",
  },
  {
    id: "logo_qr",
    name: "Logo QR",
    description: "Logo background with black/white dots",
  },
] as const;

export const VariantSelector: React.FC = () => {
  const { themeState, setThemeState } = useQREditorStore();
  const style = themeState.styles;
  const selectedVariant = style.type || "default";

  return (
    <div className="grid grid-cols-2 gap-4">
      {variants.map((variant) => (
        <button
          className={`relative cursor-pointer rounded-lg ring-2 p-4 transition-all hover:shadow-md ${
            selectedVariant === variant.id
              ? "bg-black/5 ring-blue-400 dark:bg-white"
              : "ring-gray-200 bg-white hover:ring-gray-300"
          }`}
          key={variant.id}
          onClick={() =>
            setThemeState({
              ...themeState,
              styles: { ...style, type: variant.id },
            })
          }
          tabIndex={0}
          type="button"
        >
          {/* Variant Preview */}
          <div className="mb-3 flex items-center justify-center">
            <div className="flex h-20 w-20 items-center justify-center rounded border border-gray-200 bg-gray-50">
              {variant.id === "logo_qr" ? (
                <QRCodeSVG
                  bgColor="transparent"
                  fgColor="#000000"
                  type="logo_qr"
                  size={64}
                  value="https://qrdx.dev"
                  logoSettings={{
                    src: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNTAiIGhlaWdodD0iNTAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjUwIiBoZWlnaHQ9IjUwIiBmaWxsPSIjNjBENjZBIiByeD0iMTAiLz48L3N2Zz4=",
                    logoSize: 100,
                  }}
                />
              ) : (
                <QRCodeSVG
                  bgColor="#ffffff"
                  fgColor="#000000"
                  type="default"
                  size={64}
                  value="https://qrdx.dev"
                />
              )}
            </div>
          </div>

          {/* Variant Name */}
          <p className="text-center text-black text-sm font-semibold">
            {variant.name}
          </p>
          <p className="mt-1 text-center text-gray-600 text-xs">
            {variant.description}
          </p>

          {/* Selection Indicator */}
          {selectedVariant === variant.id && (
            <div className="absolute top-2 right-2">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-400">
                <span className="font-bold text-white text-xs">✓</span>
              </div>
            </div>
          )}
        </button>
      ))}
    </div>
  );
};
