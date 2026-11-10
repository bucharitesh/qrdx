"use client";

import { Close } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { cn } from "@repo/design-system/lib/utils";
import { SearchNormal1 } from "iconsax-reactjs";
import {
  type AnyQRFrame,
  OFFICIAL_FRAME_COLLECTIONS,
  type OfficialFrameCollection,
  type OfficialFrameIndexEntry,
} from "qrdx";
import * as React from "react";
import {
  loadFrameCollection,
  loadFrameIndex,
  loadOfficialFrame,
  peekFrameIndex,
  peekIndexEntry,
  peekOfficialFrame,
} from "@/lib/frames/library";
import {
  OCCASIONS,
  upcomingOccasions,
  viewerHemisphere,
} from "@/lib/frames/occasions";
import { useFrameLibrary } from "@/lib/frames/use-frame-library";
import { CompactTile, OptionGrid, OptionTile } from "./option-tiles";
import {
  offsetBeyond,
  SidePanel,
  useInsideSidePanel,
  useSidePanelSide,
} from "./side-panel";

// The frame picker: a row of common frames, and "More" for the whole
// library (the engine's built-in styles, QRdx's official frames and the
// frames you saved), with search, a chip per group and a "Coming up" group
// of the frames for the holidays and seasons ahead. Official frames load
// a collection at a time as their tiles scroll into view; until then a tile
// keeps the frame's shape as a placeholder.

export const OFFICIAL_PREFIX = "official:";

/** A frame the picker always has: built-in, saved or the custom one. */
export interface FrameChoice {
  id: string;
  name: string;
  frame: AnyQRFrame;
  group: "built-in" | "saved" | "custom";
  /** Words search matches besides the name */
  keywords?: string;
}

const officialId = (id: string) =>
  id.startsWith(OFFICIAL_PREFIX) ? id.slice(OFFICIAL_PREFIX.length) : null;

// ── Lazy previews ───────────────────────────────────────────────────────────

const seen = new WeakMap<Element, () => void>();
let observer: IntersectionObserver | null = null;

/** Calls `onSeen` once `ref` comes near the viewport (one shared observer). */
function useSeen(ref: React.RefObject<Element | null>, onSeen: () => void) {
  const callback = React.useRef(onSeen);
  callback.current = onSeen;
  React.useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") {
      callback.current();
      return;
    }
    observer ??= new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          seen.get(entry.target)?.();
          observer?.unobserve(entry.target);
          seen.delete(entry.target);
        }
      },
      { rootMargin: "200px" },
    );
    seen.set(element, () => callback.current());
    observer.observe(element);
    return () => {
      observer?.unobserve(element);
      seen.delete(element);
    };
  }, [ref]);
}

/** The shape of a frame that hasn't loaded yet. */
function Placeholder({ ratio }: { ratio: number }) {
  return (
    <span
      aria-hidden
      className="bg-muted block max-h-full max-w-full animate-pulse rounded-[3px] motion-reduce:animate-none"
      style={
        ratio >= 1
          ? { width: "100%", aspectRatio: String(ratio) }
          : { height: "100%", aspectRatio: String(ratio) }
      }
    />
  );
}

/** An official frame's preview: loads its collection when it comes into view. */
function OfficialPreview({
  entry,
  render,
}: {
  entry: OfficialFrameIndexEntry;
  render: (frame: AnyQRFrame) => React.ReactNode;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = React.useState(false);
  useSeen(ref, () => {
    setVisible(true);
    loadFrameCollection(entry.collection).catch(() => {});
  });
  const official = peekOfficialFrame(entry.id);
  return (
    <span className="grid size-full place-items-center" ref={ref}>
      {visible && official ? (
        render({ style: "custom", spec: official.spec })
      ) : (
        <Placeholder ratio={entry.ratio} />
      )}
    </span>
  );
}

// ── Search ──────────────────────────────────────────────────────────────────

const COLLECTION_LABEL = new Map<string, string>(
  OFFICIAL_FRAME_COLLECTIONS.map((collection) => [
    collection.id,
    collection.label,
  ]),
);

const words = (query: string) =>
  query
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}'-]/gu, ""))
    .filter(Boolean);

function entryText(entry: OfficialFrameIndexEntry): string {
  return [
    entry.name,
    entry.id,
    ...entry.tags,
    COLLECTION_LABEL.get(entry.collection) ?? "",
    entry.occasion ? (OCCASIONS[entry.occasion]?.label ?? "") : "",
  ]
    .join(" ")
    .toLowerCase();
}

const matches = (text: string, terms: string[]) =>
  terms.every((term) => text.includes(term));

// ── Picker ──────────────────────────────────────────────────────────────────

const ALL = "all";
const COMING_UP = "coming-up";
const BUILT_IN = "built-in";
const SAVED = "saved";

interface Section {
  id: string;
  label: string;
  items: { id: string; entry?: OfficialFrameIndexEntry }[];
}

export function FramePicker({
  value,
  choices,
  featured,
  onPick,
  preview,
  active,
  currentName,
}: {
  /** The current choice: a FrameChoice id or "official:<id>" */
  value: string;
  choices: FrameChoice[];
  /** Ids shown in the compact row; the current choice always joins them */
  featured: string[];
  onPick: (id: string, frame: AnyQRFrame) => void;
  /** The preview drawing of a frame (fills a tile's white well) */
  preview: (frame: AnyQRFrame, id: string) => React.ReactNode;
  /** The picker is on screen: load what its tiles need */
  active: boolean;
  /** Name shown over the row for the current choice */
  currentName: string;
}) {
  const inPanel = useInsideSidePanel();
  const side = useSidePanelSide();
  const [open, setOpen] = React.useState(false);
  const [sideOffset, setSideOffset] = React.useState(28);
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState(ALL);
  const [upcoming, setUpcoming] = React.useState<string[]>([]);
  const browserId = React.useId();
  const moreRef = React.useRef<HTMLButtonElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [loadingId, setLoadingId] = React.useState<string | null>(null);

  // Re-render as the library loads; the index once the picker is on screen
  useFrameLibrary({ withIndex: active || open });
  const index = peekFrameIndex();

  const byId = React.useMemo(
    () => new Map(choices.map((choice) => [choice.id, choice])),
    [choices],
  );

  // The compact row's official tiles need their collections
  React.useEffect(() => {
    if (!active) return;
    for (const id of [...featured, value]) {
      const official = officialId(id);
      if (official) loadOfficialFrame(official).catch(() => {});
    }
  }, [active, featured, value]);

  // What's coming up depends on today and where the viewer is: worked out
  // in the browser, after the static page has hydrated.
  React.useEffect(() => {
    if (!open) return;
    setUpcoming(
      upcomingOccasions(new Date(), viewerHemisphere()).map(
        (occasion) => occasion.id,
      ),
    );
  }, [open]);

  const openCatalog = (next: boolean) => {
    const tile = moreRef.current?.getBoundingClientRect();
    const row = rootRef.current?.getBoundingClientRect();
    if (next && tile && row) setSideOffset(offsetBeyond(side, tile, row, 28));
    if (next) loadFrameIndex().catch(() => {});
    setOpen(next);
  };

  const pick = (id: string) => {
    const choice = byId.get(id);
    if (choice) {
      onPick(id, choice.frame);
      return;
    }
    const official = officialId(id);
    if (!official) return;
    const loaded = peekOfficialFrame(official);
    if (loaded) {
      onPick(id, { style: "custom", spec: loaded.spec });
      return;
    }
    // A tile picked before its collection arrived: apply it once it does
    setLoadingId(id);
    loadOfficialFrame(official)
      .then((frame) => {
        if (frame) onPick(id, { style: "custom", spec: frame.spec });
      })
      .catch(() => {})
      .finally(() => setLoadingId(null));
  };

  const nameOf = (id: string) => {
    const official = officialId(id);
    if (official) return peekIndexEntry(official)?.name ?? "Frame";
    return byId.get(id)?.name ?? id;
  };

  const tilePreview = (id: string) => {
    const official = officialId(id);
    if (!official) {
      const choice = byId.get(id);
      return choice ? preview(choice.frame, id) : null;
    }
    const entry = peekIndexEntry(official);
    const loaded = peekOfficialFrame(official);
    if (loaded) return preview({ style: "custom", spec: loaded.spec }, id);
    if (entry) {
      return (
        <OfficialPreview entry={entry} render={(frame) => preview(frame, id)} />
      );
    }
    return <Placeholder ratio={0.72} />;
  };

  // The row: featured, with the current choice swapped in
  const known = (id: string) =>
    byId.has(id) ||
    Boolean(officialId(id) && peekIndexEntry(officialId(id) ?? ""));
  const row =
    featured.includes(value) || !known(value)
      ? featured
      : [...featured.slice(0, -1), value];

  const officialCount = index?.length ?? 0;
  const total = choices.length + officialCount;

  // ── Catalog contents ────────────────────────────────────────────────────
  const terms = words(query);
  const sections: Section[] = React.useMemo(() => {
    const builtIn = choices.filter((choice) => choice.group !== "saved");
    const saved = choices.filter((choice) => choice.group === "saved");
    const entries = index ?? [];
    const byCollection = new Map<OfficialFrameCollection, Section["items"]>();
    for (const entry of entries) {
      const list = byCollection.get(entry.collection) ?? [];
      list.push({ id: `${OFFICIAL_PREFIX}${entry.id}`, entry });
      byCollection.set(entry.collection, list);
    }
    const order = new Map(upcoming.map((id, i) => [id, i]));
    const comingUp = entries
      .filter((entry) => entry.occasion && order.has(entry.occasion))
      .sort(
        (a, b) =>
          (order.get(a.occasion ?? "") ?? 0) -
          (order.get(b.occasion ?? "") ?? 0),
      )
      .map((entry) => ({ id: `${OFFICIAL_PREFIX}${entry.id}`, entry }));
    return [
      { id: COMING_UP, label: "Coming up", items: comingUp },
      {
        id: BUILT_IN,
        label: "Built-in",
        items: builtIn.map((choice) => ({ id: choice.id })),
      },
      ...OFFICIAL_FRAME_COLLECTIONS.map((collection) => ({
        id: collection.id,
        label: collection.label,
        items: byCollection.get(collection.id) ?? [],
      })),
      {
        id: SAVED,
        label: "Saved",
        items: saved.map((choice) => ({ id: choice.id })),
      },
    ].filter((section) => section.items.length > 0);
  }, [choices, index, upcoming]);

  const shown: Section[] = (() => {
    if (terms.length > 0) {
      const found = new Map<string, Section["items"][number]>();
      for (const section of sections) {
        if (section.id === COMING_UP) continue;
        if (filter !== ALL && section.id !== filter) continue;
        for (const item of section.items) {
          const text = item.entry
            ? entryText(item.entry)
            : `${nameOf(item.id)} ${item.id} ${byId.get(item.id)?.keywords ?? ""}`.toLowerCase();
          if (matches(text, terms)) found.set(item.id, item);
        }
      }
      return [{ id: "results", label: "Results", items: [...found.values()] }];
    }
    if (filter === ALL) return sections;
    return sections.filter((section) => section.id === filter);
  })();
  const resultCount = shown.reduce((sum, s) => sum + s.items.length, 0);

  React.useEffect(() => {
    if (!(open && inPanel)) return;
    if (window.matchMedia("(pointer: fine)").matches) {
      searchRef.current?.focus({ preventScroll: true });
    }
  }, [open, inPanel]);

  const closeInline = () => {
    setOpen(false);
    moreRef.current?.focus();
  };

  const gridId = `${browserId}-grid`;
  const focusGrid = () => {
    const root = document.getElementById(gridId);
    const target =
      root?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]') ??
      root?.querySelector<HTMLButtonElement>("fieldset button");
    target?.focus();
  };

  const moreTile = (
    <button
      aria-controls={inPanel ? browserId : undefined}
      aria-expanded={open}
      aria-haspopup={inPanel ? undefined : "dialog"}
      aria-label="More frames"
      className={cn(
        "group bg-muted/40 text-muted-foreground hover:text-foreground relative flex aspect-square min-w-0 flex-col items-center justify-center gap-0 rounded-[14px] border p-1 text-center transition-[background-color,border-color,transform] outline-none active:scale-[0.96] hover:border-foreground/20 hover:bg-accent/40 focus-visible:border-foreground/30 focus-visible:ring-ring/40 focus-visible:ring-[3px]",
        open && "border-foreground/30 bg-accent text-foreground",
      )}
      onClick={
        inPanel
          ? () => {
              if (open) closeInline();
              else openCatalog(true);
            }
          : undefined
      }
      ref={moreRef}
      title={officialCount > 0 ? `All ${total} frames` : "All frames"}
      type="button"
    >
      <span className="text-sm font-semibold tabular-nums leading-none">
        {inPanel && open
          ? "Less"
          : officialCount > 0
            ? `+${total - row.length}`
            : "All"}
      </span>
      {!(inPanel && open) && (
        <span className="mt-1 text-[10px] leading-none">More</span>
      )}
    </button>
  );

  const chips = [
    { id: ALL, label: "All", count: total },
    ...sections.map((section) => ({
      id: section.id,
      label: section.label,
      count: section.items.length,
    })),
  ];

  const catalog = (
    <div className="space-y-2.5" id={inPanel ? browserId : undefined}>
      <div
        className={cn(
          "space-y-2.5",
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
              aria-label="Search frames"
              className="h-8 pl-8 text-sm"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  focusGrid();
                }
              }}
              placeholder={
                officialCount > 0
                  ? `Search ${total} frames: Diwali, menu, Wi-Fi…`
                  : "Search frames"
              }
              ref={searchRef}
              type="search"
              value={query}
            />
          </div>
          {inPanel && (
            <Button
              aria-label="Close frames"
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
          aria-label="Filter frames"
          className="no-scrollbar -mx-2.5 flex gap-0.5 overflow-x-auto px-2.5 [mask-image:linear-gradient(to_right,transparent,black_10px,black_calc(100%-16px),transparent)]"
          role="toolbar"
        >
          {chips.map((chip) => (
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

      {resultCount > 0 ? (
        <div
          className={cn(
            "-mx-1 space-y-4 px-1 pt-1 pb-1",
            inPanel && "max-h-[24rem] overflow-y-auto overscroll-contain",
          )}
          id={gridId}
        >
          {shown.map((section) => (
            <section aria-label={section.label} key={section.id}>
              {(shown.length > 1 || section.id === COMING_UP) && (
                <h4 className="text-muted-foreground mb-2 flex items-baseline justify-between text-xs font-medium">
                  <span>{section.label}</span>
                  {section.id === COMING_UP && upcoming.length > 0 && (
                    <span className="truncate pl-3 font-normal">
                      {upcoming
                        .slice(0, 3)
                        .map((id) => OCCASIONS[id]?.label)
                        .filter(Boolean)
                        .join(", ")}
                    </span>
                  )}
                </h4>
              )}
              <OptionGrid
                className={
                  inPanel ? undefined : "grid-cols-4 @[25rem]:grid-cols-5"
                }
                label={`${section.label} frames`}
              >
                {section.items.map((item) => (
                  <OptionTile
                    hint={loadingId === item.id ? "Loading…" : undefined}
                    key={item.id}
                    name={item.entry?.name ?? nameOf(item.id)}
                    onSelect={() => pick(item.id)}
                    selected={value === item.id}
                  >
                    {tilePreview(item.id)}
                  </OptionTile>
                ))}
              </OptionGrid>
            </section>
          ))}
        </div>
      ) : (
        <div className="text-muted-foreground flex flex-col items-center gap-2 py-6 text-center text-xs">
          {index || terms.length > 0
            ? `No frames match "${query}".`
            : "Loading frames…"}
          {(terms.length > 0 || filter !== ALL) && (
            <Button
              onClick={() => {
                setQuery("");
                setFilter(ALL);
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              Show all
            </Button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div ref={rootRef}>
      <div className="mb-2 flex items-baseline justify-between gap-3 text-xs">
        <span className="text-muted-foreground font-medium">Frame</span>
        <span className="text-foreground min-w-0 truncate font-medium">
          {currentName}
        </span>
      </div>

      <OptionGrid columns={6} label="Common frames">
        {row.map((id) => (
          <CompactTile
            key={id}
            name={nameOf(id)}
            onSelect={() => pick(id)}
            selected={value === id}
          >
            {tilePreview(id)}
          </CompactTile>
        ))}
        {inPanel ? (
          moreTile
        ) : (
          <SidePanel
            description="Every frame: built-in styles, QRdx's official frames and the frames you saved. Picking one applies it right away."
            initialFocus={searchRef}
            onOpenChange={openCatalog}
            open={open}
            sideOffset={sideOffset}
            title="Frame"
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
