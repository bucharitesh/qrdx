"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Skeleton } from "@repo/design-system/components/ui/skeleton";
import { cn } from "@repo/design-system/lib/utils";
import { SearchNormal1 } from "iconsax-reactjs";
import { type KeyboardEvent, useMemo, useRef, useState } from "react";
import { useAIArtPresets } from "./load-presets";
import {
  AI_ART_CATEGORIES,
  AI_ART_PRESET_COUNT,
  aiArtPresetPreview,
} from "./preset-meta";
import {
  type AIArtPresetTab,
  presetsForTab,
  searchPresets,
  searchWords,
} from "./preset-search";
import type { AIArtPreset } from "./presets";

interface AIArtPresetGalleryProps {
  activePresetId: string | null;
  disabled?: boolean;
  onSelect: (preset: AIArtPreset) => void;
}

const TABS: { id: AIArtPresetTab; label: string }[] = [
  { id: "featured", label: "Featured" },
  { id: "all", label: "All" },
  ...AI_ART_CATEGORIES,
];

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  AI_ART_CATEGORIES.map(({ id, label }) => [id, label]),
);

/**
 * The AI art style picker: search, Featured, All and a tab per category,
 * with a preview of each style. The catalogue loads on mount
 * (./load-presets.ts), so the page that holds the picker doesn't carry it.
 */
export function AIArtPresetGallery({
  activePresetId,
  disabled,
  onSelect,
}: AIArtPresetGalleryProps) {
  const { catalogue, failed, retry } = useAIArtPresets();
  const [query, setQuery] = useState("");
  const [pickedTab, setPickedTab] = useState<AIArtPresetTab | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const presets = catalogue?.AI_ART_PRESETS ?? [];
  const featured = catalogue?.AI_ART_FEATURED_PRESET_IDS ?? [];
  const active = presets.find((preset) => preset.id === activePresetId);
  // Opens where the chosen style is, else on Featured.
  const tab: AIArtPresetTab =
    pickedTab ??
    (active && !featured.includes(active.id) ? active.category : "featured");
  const searching = searchWords(query).length > 0;
  const shown = useMemo(
    () =>
      searching
        ? searchPresets(presets, query, CATEGORY_LABELS)
        : presetsForTab(presets, tab, featured),
    [presets, featured, searching, query, tab],
  );

  const openTab = (next: AIArtPresetTab) => {
    setQuery("");
    setPickedTab(next);
    listRef.current?.scrollTo({ top: 0 });
  };

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && searching && shown[0]) {
      event.preventDefault();
      onSelect(shown[0]);
    }
    if (event.key === "Escape" && query) {
      event.preventDefault();
      setQuery("");
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="relative">
        <SearchNormal1
          aria-hidden
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        />
        <Input
          aria-label="Search styles"
          className="pl-9"
          disabled={disabled}
          onChange={(event) => {
            setQuery(event.target.value);
            listRef.current?.scrollTo({ top: 0 });
          }}
          onKeyDown={onSearchKeyDown}
          placeholder="Search styles: cats, gold, tiles…"
          type="search"
          value={query}
        />
      </div>

      <div
        aria-label="Style categories"
        className="-mx-1 flex gap-1 overflow-x-auto px-1 [mask-image:linear-gradient(to_right,transparent,black_8px,black_calc(100%-24px),transparent)] [scrollbar-width:none]"
        role="toolbar"
      >
        {TABS.map(({ id, label }) => {
          const current = !searching && tab === id;
          return (
            <Button
              aria-pressed={current}
              className={cn(
                "h-7 shrink-0 px-2.5 text-xs font-normal",
                current && "font-medium",
              )}
              disabled={disabled}
              key={id}
              onClick={() => openTab(id)}
              size="sm"
              type="button"
              variant={current ? "secondary" : "ghost"}
            >
              {label}
            </Button>
          );
        })}
      </div>

      <div
        className="-mx-1 max-h-[23rem] overflow-y-auto overscroll-contain px-1 py-1"
        ref={listRef}
      >
        {catalogue ? (
          shown.length > 0 ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(5.75rem,1fr))] gap-2">
              {shown.map((preset) => (
                <PresetTile
                  active={preset.id === activePresetId}
                  disabled={disabled}
                  key={preset.id}
                  onSelect={onSelect}
                  preset={preset}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <p className="text-muted-foreground text-xs">
                No styles match “{query.trim()}”. Describe it in the prompt
                instead.
              </p>
              <Button
                onClick={() => setQuery("")}
                size="sm"
                type="button"
                variant="ghost"
              >
                Clear search
              </Button>
            </div>
          )
        ) : failed ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <p className="text-muted-foreground text-xs">
              The styles didn't load.
            </p>
            <Button onClick={retry} size="sm" type="button" variant="outline">
              Try again
            </Button>
          </div>
        ) : (
          <div
            aria-busy
            className="grid grid-cols-[repeat(auto-fill,minmax(5.75rem,1fr))] gap-2"
          >
            {Array.from({ length: 6 }, (_, index) => (
              <div
                className="flex flex-col overflow-hidden rounded-lg border"
                key={index}
              >
                <Skeleton className="aspect-square w-full rounded-none" />
                <span className="px-2 py-1.5">
                  <Skeleton className="h-3 w-3/4" />
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-muted-foreground text-xs">
        {searching && catalogue
          ? `${shown.length} of ${presets.length} styles. `
          : `${catalogue ? presets.length : AI_ART_PRESET_COUNT} styles. `}
        Picking one fills in the prompt; edit it freely.
      </p>
    </div>
  );
}

function PresetTile({
  preset,
  active,
  disabled,
  onSelect,
}: {
  preset: AIArtPreset;
  active: boolean;
  disabled?: boolean;
  onSelect: (preset: AIArtPreset) => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "bg-background hover:border-foreground/30 flex min-w-0 flex-col overflow-hidden rounded-lg border text-left transition-colors disabled:pointer-events-none disabled:opacity-50",
        active && "border-foreground ring-foreground/15 ring-2",
      )}
      disabled={disabled}
      onClick={() => onSelect(preset)}
      title={preset.prompt}
      type="button"
    >
      <span
        aria-hidden
        className="bg-muted block aspect-square w-full"
        style={preset.swatch ? { background: preset.swatch } : undefined}
      >
        <img
          alt=""
          className="size-full object-cover"
          decoding="async"
          draggable={false}
          height={256}
          loading="lazy"
          src={aiArtPresetPreview(preset.id)}
          width={256}
        />
      </span>
      <span className="truncate px-2 py-1.5 text-xs font-medium">
        {preset.name}
      </span>
    </button>
  );
}
