"use client";

import type React from "react";
import { useQREditorStore } from "@/store/editor-store";
import { BRAND_LOGOS, type BrandLogo } from "@/lib/brand-logos";

export const BrandLogoSelector: React.FC = () => {
  const { themeState, setThemeState } = useQREditorStore();
  const style = themeState.styles;
  const currentLogoSrc = style.logoSettings?.src;

  const handleLogoSelect = (logo: BrandLogo) => {
    setThemeState({
      ...themeState,
      styles: {
        ...style,
        type: "logo_qr",
        logoSettings: {
          src: logo.dataUri,
          logoSize: 100, // 100% = full size
        },
      },
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
        Built-in Brand Logos
      </p>
      <div className="grid grid-cols-2 gap-3">
        {BRAND_LOGOS.map((logo) => {
          const isSelected = currentLogoSrc === logo.dataUri;
          return (
            <button
              className={`relative cursor-pointer rounded-lg ring-2 p-3 transition-all hover:shadow-md ${
                isSelected
                  ? "bg-black/5 ring-blue-400 dark:bg-white"
                  : "ring-gray-200 bg-white hover:ring-gray-300"
              }`}
              key={logo.id}
              onClick={() => handleLogoSelect(logo)}
              tabIndex={0}
              type="button"
            >
              {/* Logo Preview */}
              <div className="mb-2 flex items-center justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded border border-gray-200 bg-white">
                  <img
                    alt={logo.name}
                    className="h-14 w-14 rounded object-cover"
                    src={logo.dataUri}
                  />
                </div>
              </div>

              {/* Logo Name */}
              <p className="text-center text-black text-xs font-medium">
                {logo.name}
              </p>

              {/* Selection Indicator */}
              {isSelected && (
                <div className="absolute top-2 right-2">
                  <div className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-400">
                    <span className="font-bold text-white text-[10px]">✓</span>
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
