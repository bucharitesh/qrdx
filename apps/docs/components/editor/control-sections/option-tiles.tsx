"use client";

import { Close, Tick } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { cn } from "@repo/design-system/lib/utils";
import { SearchNormal1 } from "iconsax-reactjs";
import * as React from "react";
import { SHAPE_CATEGORIES } from "./shape-catalog";

const GRID_KEYS = new Set([
  "ArrowRight",
  "ArrowLeft",
  "ArrowDown",
  "ArrowUp",
  "Home",
  "End",
]);

/** Arrow keys move focus between the tiles of a grid; Enter or Space picks. */
function onGridKeyDown(event: React.KeyboardEvent<HTMLElement>) {
  if (!GRID_KEYS.has(event.key)) return;
  const grid = event.currentTarget;
  const tiles = [
    ...grid.querySelectorAll<HTMLButtonElement>(":scope > button"),
  ];
  const index = tiles.indexOf(document.activeElement as HTMLButtonElement);
  if (index < 0) return;
  const columns =
    getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean)
      .length || 1;
  const step: Record<string, number> = {
    ArrowRight: 1,
    ArrowLeft: -1,
    ArrowDown: columns,
    ArrowUp: -columns,
  };
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? tiles.length - 1
        : index + (step[event.key] ?? 0);
  const target = tiles[Math.max(0, Math.min(tiles.length - 1, next))];
  if (target && target !== tiles[index]) {
    event.preventDefault();
    target.focus();
  }
}

/** Grid of selectable preview tiles (patterns, eyes, borders, frames, levels). */
export function OptionGrid({
  label,
  columns = 4,
  className,
  children,
}: {
  /** Accessible name for the group */
  label: string;
  /** 6 is the compact row of small tiles. */
  columns?: 3 | 4 | 6;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset
      aria-label={label}
      className={cn(
        "m-0 grid min-w-0 border-0 p-0",
        columns === 6
          ? "grid-cols-6 gap-1.5"
          : columns === 3
            ? "grid-cols-3 gap-2"
            : "grid-cols-3 gap-2 @[22rem]:grid-cols-4",
        className,
      )}
      onKeyDown={onGridKeyDown}
    >
      {children}
    </fieldset>
  );
}

/**
 * One option: a white preview well (codes are dark-on-light) with the name
 * under it. The selected tile gets a stronger border and a small check.
 */
export function OptionTile({
  selected,
  name,
  hint,
  risk,
  onSelect,
  children,
  className,
}: {
  selected: boolean;
  name: string;
  hint?: string;
  /** Why this option may not scan with the current style (shown as a hint). */
  risk?: string | null;
  onSelect: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const note = risk ? "May not scan" : hint;
  return (
    <button
      aria-pressed={selected}
      className={cn(
        "group bg-card relative flex min-w-0 flex-col items-center gap-1.5 rounded-lg border p-1.5 pb-2 text-center transition-[color,background-color,border-color,transform] outline-none active:scale-[0.97]",
        "hover:border-foreground/20 hover:bg-accent/40 focus-visible:border-foreground/30 focus-visible:ring-ring/40 focus-visible:ring-[3px]",
        selected &&
          "border-foreground/40 bg-accent/60 hover:border-foreground/40",
        className,
      )}
      onClick={onSelect}
      title={risk ?? undefined}
      type="button"
    >
      <span className="grid aspect-square w-full place-items-center overflow-hidden rounded-[10px] bg-white p-2 ring-1 ring-black/5 [&_svg]:max-h-full [&_svg]:max-w-full">
        {children}
      </span>
      <span
        className={cn(
          "text-muted-foreground w-full truncate text-[11px] leading-tight font-medium",
          selected && "text-foreground",
        )}
      >
        {name}
      </span>
      {note && (
        <span
          className={cn(
            "-mt-1 text-[10px] leading-tight tabular-nums",
            risk
              ? "text-amber-700 dark:text-amber-400"
              : "text-muted-foreground",
          )}
        >
          {note}
        </span>
      )}
      {selected && (
        <span className="bg-primary text-primary-foreground absolute top-1 right-1 grid size-4 place-items-center rounded-full shadow-sm">
          <Tick className="size-3" />
        </span>
      )}
    </button>
  );
}

/** Small uppercase label for a group inside a section. */
export function OptionGroupLabel({
  children,
  kbd,
}: {
  children: React.ReactNode;
  kbd?: React.ReactNode;
}) {
  return (
    <div className="text-muted-foreground mb-2 flex items-center justify-between text-xs font-medium">
      <span>{children}</span>
      {kbd}
    </div>
  );
}

const SMALL_TILE =
  "group bg-card relative grid aspect-square min-w-0 place-items-center rounded-[14px] border p-1 transition-[background-color,border-color,transform] outline-none active:scale-[0.96] hover:border-foreground/20 hover:bg-accent/40 focus-visible:border-foreground/30 focus-visible:ring-ring/40 focus-visible:ring-[3px]";

/** Small preview-only tile for the compact row; the name is its label. */
function CompactTile({
  name,
  selected,
  risk,
  onSelect,
  children,
}: {
  name: string;
  selected: boolean;
  risk?: string | null;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={risk ? `${name}, may not scan` : name}
      aria-pressed={selected}
      className={cn(
        SMALL_TILE,
        selected &&
          "border-foreground/40 bg-accent/60 hover:border-foreground/40",
      )}
      onClick={onSelect}
      title={risk ? `${name}: may not scan` : name}
      type="button"
    >
      <span className="grid size-full place-items-center overflow-hidden rounded-[10px] bg-white p-1.5 ring-1 ring-black/5 [&_svg]:max-h-full [&_svg]:max-w-full">
        {children}
      </span>
      {selected && (
        <span className="bg-primary text-primary-foreground absolute -top-1 -right-1 grid size-4 place-items-center rounded-full shadow-sm">
          <Tick className="size-3" />
        </span>
      )}
      {risk && (
        <span
          aria-hidden
          className="ring-card absolute bottom-1 left-1 size-1.5 rounded-full bg-amber-500 ring-2"
        />
      )}
    </button>
  );
}

export interface ShapeOption<T extends string> {
  id: T;
  name: string;
}

interface ShapePickerProps<T extends string> {
  /** Group name, e.g. "Dot shape"; the full list carries it as its label. */
  label: string;
  /** Plural for the "More" tile and search, e.g. "dot shapes". */
  noun: string;
  options: ShapeOption<T>[];
  /** Shown in the compact row; the current choice always joins them. */
  featured: T[];
  value: T;
  onChange: (id: T) => void;
  category: (id: T) => string;
  /** Filter chips, in order (default: Classic, Rounded, Decorative, Playful). */
  categories?: { id: string; label: string }[];
  /** The preview drawing for one option (fills its white well). */
  preview: (id: T) => React.ReactNode;
  /** Why an option may not scan with the rest of the style, if it may not. */
  riskOf?: (id: T) => string | null;
}

/**
 * Most-used first: a row of small tiles plus "More", which opens an inline
 * browser (search, category chips, every option) right under the row, so
 * the code preview stays in view while you try shapes.
 */
export function ShapePicker<T extends string>({
  label,
  noun,
  options,
  featured,
  value,
  onChange,
  category,
  categories = SHAPE_CATEGORIES,
  preview,
  riskOf,
}: ShapePickerProps<T>) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState("all");
  const browserId = React.useId();
  const moreRef = React.useRef<HTMLButtonElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);

  const byId = new Map(options.map((option) => [option.id, option]));
  const row = featured.includes(value)
    ? featured
    : [...featured.slice(0, -1), value];
  const current = byId.get(value);
  const currentRisk = riskOf?.(value) ?? null;

  const needle = query.trim().toLowerCase();
  const visible = options.filter(
    (option) =>
      (filter === "all" || category(option.id) === filter) &&
      (!needle ||
        option.name.toLowerCase().includes(needle) ||
        option.id.includes(needle)),
  );
  const counts = new Map<string, number>();
  for (const option of options) {
    const key = category(option.id);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const close = () => {
    setOpen(false);
    moreRef.current?.focus();
  };

  React.useEffect(() => {
    if (!open) return;
    // Jump to search with a mouse or keyboard; on touch it would pop the keyboard.
    if (window.matchMedia("(pointer: fine)").matches) {
      searchRef.current?.focus({ preventScroll: true });
    }
  }, [open]);

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3 text-xs">
        <span className="text-muted-foreground font-medium">{label}</span>
        <span className="flex min-w-0 items-baseline gap-1.5 truncate">
          <span className="text-foreground font-medium">{current?.name}</span>
          {currentRisk && (
            <span
              className="text-amber-700 dark:text-amber-400"
              title={currentRisk}
            >
              May not scan
            </span>
          )}
        </span>
      </div>

      <OptionGrid columns={6} label={`Common ${noun}`}>
        {row.map((id) => (
          <CompactTile
            key={id}
            name={byId.get(id)?.name ?? id}
            onSelect={() => onChange(id)}
            risk={riskOf?.(id)}
            selected={value === id}
          >
            {preview(id)}
          </CompactTile>
        ))}
        <button
          aria-controls={browserId}
          aria-expanded={open}
          aria-label={`More ${noun}`}
          className={cn(
            SMALL_TILE,
            "bg-muted/40 text-muted-foreground hover:text-foreground flex flex-col items-center justify-center gap-0 text-center",
            open && "border-foreground/30 bg-accent text-foreground",
          )}
          onClick={() => (open ? close() : setOpen(true))}
          ref={moreRef}
          title={`All ${options.length} ${noun}`}
          type="button"
        >
          <span className="text-sm font-semibold tabular-nums leading-none">
            {open ? "Less" : `+${options.length - row.length}`}
          </span>
          {!open && <span className="mt-1 text-[10px] leading-none">More</span>}
        </button>
      </OptionGrid>

      {open && (
        // biome-ignore lint/a11y/noStaticElementInteractions: Escape closes the browser from anywhere inside it.
        <div
          className="bg-muted/30 animate-in fade-in-0 slide-in-from-top-1 mt-2 space-y-2.5 rounded-xl border p-2.5 duration-200 motion-reduce:animate-none"
          id={browserId}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              close();
            }
          }}
        >
          <div className="flex items-center gap-1.5">
            <div className="relative min-w-0 flex-1">
              <SearchNormal1
                aria-hidden
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2"
              />
              <Input
                aria-label={`Search ${noun}`}
                className="h-8 pl-8 text-sm"
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`Search ${options.length} ${noun}`}
                ref={searchRef}
                value={query}
              />
            </div>
            <Button
              aria-label={`Close ${noun}`}
              onClick={close}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <Close />
            </Button>
          </div>

          <div
            aria-label={`Filter ${noun}`}
            // One line that scrolls sideways if the panel is narrow.
            className="no-scrollbar -mx-2.5 flex gap-0.5 overflow-x-auto px-2.5 [mask-image:linear-gradient(to_right,transparent,black_10px,black_calc(100%-16px),transparent)]"
            role="toolbar"
          >
            {[
              { id: "all", label: "All", count: options.length },
              ...categories
                .filter((item) => counts.has(item.id))
                .map((item) => ({ ...item, count: counts.get(item.id) ?? 0 })),
            ].map((chip) => (
              <Button
                aria-pressed={filter === chip.id}
                className="h-7 shrink-0 gap-1 px-2 text-xs"
                key={chip.id}
                onClick={() => setFilter(chip.id)}
                size="sm"
                type="button"
                variant={filter === chip.id ? "secondary" : "ghost"}
              >
                {chip.label}
                <span className="text-muted-foreground tabular-nums">
                  {chip.count}
                </span>
              </Button>
            ))}
          </div>

          {visible.length > 0 ? (
            <div className="-mx-1 max-h-[18.5rem] overflow-y-auto overscroll-contain px-1 pt-1 pb-1">
              <OptionGrid label={label}>
                {visible.map((option) => (
                  <OptionTile
                    key={option.id}
                    name={option.name}
                    onSelect={() => onChange(option.id)}
                    risk={riskOf?.(option.id)}
                    selected={value === option.id}
                  >
                    {preview(option.id)}
                  </OptionTile>
                ))}
              </OptionGrid>
            </div>
          ) : (
            <div className="text-muted-foreground flex flex-col items-center gap-2 py-6 text-center text-xs">
              No {noun} match "{query}".
              <Button
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                Show all
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
