"use client";

import { Close, Tick } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { cn } from "@repo/design-system/lib/utils";
import { SearchNormal1 } from "iconsax-reactjs";
import * as React from "react";
import { SHAPE_CATEGORIES } from "./shape-catalog";
import {
  offsetBeyond,
  SidePanel,
  useInsideSidePanel,
  useSidePanelSide,
} from "./side-panel";

/**
 * Where an arrow, Home or End key moves focus in a grid of `count` tiles,
 * or null for any other key or when focus would stay put. Enter or Space
 * picks the focused tile (they are buttons).
 */
export function gridMove(
  key: string,
  index: number,
  count: number,
  columns: number,
): number | null {
  if (index < 0 || count === 0) return null;
  const step: Record<string, number> = {
    ArrowRight: 1,
    ArrowLeft: -1,
    ArrowDown: Math.max(1, columns),
    ArrowUp: -Math.max(1, columns),
  };
  let next: number;
  if (key === "Home") next = 0;
  else if (key === "End") next = count - 1;
  else if (key in step) next = index + (step[key] ?? 0);
  else return null;
  const clamped = Math.max(0, Math.min(count - 1, next));
  return clamped === index ? null : clamped;
}

/**
 * Tiles in the first row. A <fieldset> grid reports its declared
 * `repeat(6, minmax(0px, 1fr))`, not resolved tracks, so counting the
 * computed grid-template-columns gave the wrong number of columns.
 */
export function firstRowLength(tops: number[]): number {
  const first = tops[0];
  if (first === undefined) return 1;
  const length = tops.findIndex((top) => Math.abs(top - first) > 1);
  return length === -1 ? tops.length : length;
}

/** Arrow keys move focus between the tiles of a grid; Enter or Space picks. */
function onGridKeyDown(event: React.KeyboardEvent<HTMLElement>) {
  const grid = event.currentTarget;
  const tiles = [
    ...grid.querySelectorAll<HTMLButtonElement>(":scope > button"),
  ];
  const index = tiles.indexOf(document.activeElement as HTMLButtonElement);
  if (index < 0) return;
  const columns = firstRowLength(tiles.map((tile) => tile.offsetTop));
  const next = gridMove(event.key, index, tiles.length, columns);
  const target = next === null ? undefined : tiles[next];
  if (target) {
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
  blocked,
  onSelect,
  children,
  className,
}: {
  selected: boolean;
  name: string;
  hint?: string;
  /** Why this option may not scan with the current style (shown as a hint). */
  risk?: string | null;
  /** Doesn't scan with the rest of the style, so it can't be picked. */
  blocked?: boolean;
  onSelect: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const note = blocked ? "Won't scan here" : risk ? "May not scan" : hint;
  return (
    <button
      aria-pressed={selected}
      className={cn(
        "group bg-card relative flex min-w-0 flex-col items-center gap-1.5 rounded-lg border p-1.5 pb-2 text-center transition-[color,background-color,border-color,transform] outline-none active:scale-[0.97]",
        "hover:border-foreground/20 hover:bg-accent/40 focus-visible:border-foreground/30 focus-visible:ring-ring/40 focus-visible:ring-[3px]",
        selected &&
          "border-foreground/40 bg-accent/60 hover:border-foreground/40",
        blocked && "cursor-not-allowed opacity-45 active:scale-100",
        className,
      )}
      disabled={blocked}
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
export function CompactTile({
  name,
  selected,
  risk,
  blocked,
  onSelect,
  children,
}: {
  name: string;
  selected: boolean;
  risk?: string | null;
  blocked?: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={
        blocked
          ? `${name}, won't scan with this style`
          : risk
            ? `${name}, may not scan`
            : name
      }
      aria-pressed={selected}
      className={cn(
        SMALL_TILE,
        selected &&
          "border-foreground/40 bg-accent/60 hover:border-foreground/40",
        blocked && "cursor-not-allowed opacity-45 active:scale-100",
      )}
      disabled={blocked}
      onClick={onSelect}
      title={
        blocked
          ? `${name}: won't scan with this style`
          : risk
            ? `${name}: may not scan`
            : name
      }
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
  /** Options that don't scan with the rest of the style (can't be picked). */
  blockedOf?: (id: T) => boolean;
}

/**
 * Most-used first: a row of small tiles plus "More", which opens the full
 * catalog (search, category chips, every option) in a side panel beside the
 * design panel (a bottom sheet on phones), so the code preview stays in view
 * while you try shapes. Picking applies at once and keeps the panel open.
 * Already inside a side panel (a section opened at the side), the catalog
 * opens in place instead of stacking a second panel.
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
  blockedOf,
}: ShapePickerProps<T>) {
  const inPanel = useInsideSidePanel();
  const side = useSidePanelSide();
  const [open, setOpen] = React.useState(false);
  // How far the catalog sits from the More tile: enough to clear the whole
  // picker row (and so the design panel's edge), measured as it opens.
  const [sideOffset, setSideOffset] = React.useState(28);
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState("all");
  const browserId = React.useId();
  const moreRef = React.useRef<HTMLButtonElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const gridRef = React.useRef<HTMLDivElement>(null);
  /** The whole picker row: the catalog opens beyond it, clear of the panel. */
  const rootRef = React.useRef<HTMLDivElement>(null);

  const openCatalog = (next: boolean) => {
    const tile = moreRef.current?.getBoundingClientRect();
    const row = rootRef.current?.getBoundingClientRect();
    // The row sits in the panel's 16px padding: 28px past it leaves the same
    // 12px gap beyond the panel's edge that the section rows get.
    if (next && tile && row) setSideOffset(offsetBeyond(side, tile, row, 28));
    setOpen(next);
  };

  const byId = new Map(options.map((option) => [option.id, option]));
  // The current choice joins the row; a value with no option (nothing
  // picked here) leaves the row as it is
  const row =
    featured.includes(value) || !byId.has(value)
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

  const closeInline = () => {
    setOpen(false);
    moreRef.current?.focus();
  };

  React.useEffect(() => {
    if (!(open && inPanel)) return;
    // Jump to search with a mouse or keyboard; on touch it would pop the keyboard.
    if (window.matchMedia("(pointer: fine)").matches) {
      searchRef.current?.focus({ preventScroll: true });
    }
  }, [open, inPanel]);

  /** ArrowDown from search goes to the picked tile (or the first one). */
  const focusGrid = () => {
    const grid = gridRef.current;
    const target =
      grid?.querySelector<HTMLButtonElement>(
        'button[aria-pressed="true"]:not(:disabled)',
      ) ?? grid?.querySelector<HTMLButtonElement>("button:not(:disabled)");
    target?.focus();
  };

  const moreTile = (
    <button
      aria-controls={inPanel ? browserId : undefined}
      aria-expanded={open}
      aria-haspopup={inPanel ? undefined : "dialog"}
      aria-label={`More ${noun}`}
      className={cn(
        SMALL_TILE,
        "bg-muted/40 text-muted-foreground hover:text-foreground flex flex-col items-center justify-center gap-0 text-center",
        open && "border-foreground/30 bg-accent text-foreground",
      )}
      onClick={
        inPanel ? () => (open ? closeInline() : setOpen(true)) : undefined
      }
      ref={moreRef}
      title={`All ${options.length} ${noun}`}
      type="button"
    >
      <span className="text-sm font-semibold tabular-nums leading-none">
        {inPanel && open ? "Less" : `+${options.length - row.length}`}
      </span>
      {!(inPanel && open) && (
        <span className="mt-1 text-[10px] leading-none">More</span>
      )}
    </button>
  );

  const catalog = (
    <div className="space-y-2.5">
      <div
        className={cn(
          "space-y-2.5",
          // In a side panel the search and filters stay put while the grid scrolls.
          !inPanel && "bg-popover sticky top-0 z-10 -mx-3 px-3 pb-1",
        )}
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
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  focusGrid();
                }
              }}
              placeholder={`Search ${options.length} ${noun}`}
              ref={searchRef}
              value={query}
            />
          </div>
          {inPanel && (
            <Button
              aria-label={`Close ${noun}`}
              onClick={closeInline}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <Close />
            </Button>
          )}
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
      </div>

      {visible.length > 0 ? (
        <div
          className={cn(
            "-mx-1 px-1 pt-1 pb-1",
            inPanel && "max-h-[18.5rem] overflow-y-auto overscroll-contain",
          )}
          ref={gridRef}
        >
          <OptionGrid
            // The side panel is wide enough for 4 to 5 columns.
            className={inPanel ? undefined : "grid-cols-4 @[25rem]:grid-cols-5"}
            label={label}
          >
            {visible.map((option) => (
              <OptionTile
                blocked={value !== option.id && blockedOf?.(option.id)}
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
  );

  return (
    <div ref={rootRef}>
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
            blocked={value !== id && blockedOf?.(id)}
            key={id}
            name={byId.get(id)?.name ?? id}
            onSelect={() => onChange(id)}
            risk={riskOf?.(id)}
            selected={value === id}
          >
            {preview(id)}
          </CompactTile>
        ))}
        {inPanel ? (
          moreTile
        ) : (
          <SidePanel
            description={`All ${options.length} ${noun}. Picking one applies it right away.`}
            initialFocus={searchRef}
            onOpenChange={openCatalog}
            open={open}
            sideOffset={sideOffset}
            title={label}
            trigger={moreTile}
          >
            {catalog}
          </SidePanel>
        )}
      </OptionGrid>

      {inPanel && open && (
        // biome-ignore lint/a11y/noStaticElementInteractions: Escape closes the browser from anywhere inside it.
        <div
          className="bg-muted/30 animate-in fade-in-0 slide-in-from-top-1 mt-2 rounded-xl border p-2.5 duration-200 motion-reduce:animate-none"
          id={browserId}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              closeInline();
            }
          }}
        >
          {catalog}
        </div>
      )}
    </div>
  );
}
