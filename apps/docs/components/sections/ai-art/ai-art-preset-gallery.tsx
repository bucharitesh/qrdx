"use client";

import { cn } from "@repo/design-system/lib/utils";
import { useState } from "react";
import {
  AI_ART_CATEGORIES,
  AI_ART_PRESETS,
  type AIArtCategory,
  type AIArtPreset,
} from "./presets";

interface AIArtPresetGalleryProps {
  activePresetId: string | null;
  disabled?: boolean;
  onSelect: (preset: AIArtPreset) => void;
}

export function AIArtPresetGallery({
  activePresetId,
  disabled,
  onSelect,
}: AIArtPresetGalleryProps) {
  const [category, setCategory] = useState<AIArtCategory>(
    () =>
      AI_ART_PRESETS.find((preset) => preset.id === activePresetId)?.category ??
      "nature",
  );
  const presets = AI_ART_PRESETS.filter(
    (preset) => preset.category === category,
  );

  return (
    <div className="flex flex-col gap-3">
      <div
        aria-label="Style categories"
        className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
        role="tablist"
      >
        {AI_ART_CATEGORIES.map(({ id, label }) => (
          <button
            aria-selected={category === id}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              category === id
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:text-foreground",
            )}
            disabled={disabled}
            key={id}
            onClick={() => setCategory(id)}
            role="tab"
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {presets.map((preset) => {
          const isActive = preset.id === activePresetId;
          return (
            <button
              aria-pressed={isActive}
              className={cn(
                "bg-background hover:border-primary/50 flex flex-col overflow-hidden rounded-lg border text-left transition-all disabled:pointer-events-none disabled:opacity-50",
                isActive && "border-primary ring-primary/20 ring-2",
              )}
              disabled={disabled}
              key={preset.id}
              onClick={() => onSelect(preset)}
              title={preset.prompt}
              type="button"
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
      <p className="text-muted-foreground text-xs">
        {AI_ART_PRESETS.length} styles. Picking one fills in the prompt; edit it
        freely.
      </p>
    </div>
  );
}
