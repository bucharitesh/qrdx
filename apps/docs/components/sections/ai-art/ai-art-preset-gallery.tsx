"use client";

import { cn } from "@repo/design-system/lib/utils";
import { AI_ART_PRESETS, type AIArtPreset } from "./config";

interface AIArtPresetGalleryProps {
  activePrompt: string;
  disabled?: boolean;
  onSelect: (preset: AIArtPreset) => void;
}

export function AIArtPresetGallery({
  activePrompt,
  disabled,
  onSelect,
}: AIArtPresetGalleryProps) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {AI_ART_PRESETS.map((preset) => {
        const isActive = activePrompt.trim() === preset.prompt;
        return (
          <button
            key={preset.id}
            type="button"
            disabled={disabled}
            aria-pressed={isActive}
            title={preset.prompt}
            onClick={() => onSelect(preset)}
            className={cn(
              "flex flex-col overflow-hidden rounded-lg border bg-background text-left transition-all hover:border-primary/50 disabled:pointer-events-none disabled:opacity-50",
              isActive && "border-primary ring-2 ring-primary/20",
            )}
          >
            <span
              aria-hidden
              className="h-12 w-full"
              style={{ background: preset.swatch }}
            />
            <span className="px-2.5 py-2 text-xs font-medium">
              {preset.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
