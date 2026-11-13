"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { SearchNormal1 } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
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
import { OptionGrid, OptionTile } from "./option-tiles";
import { useInsideSidePanel } from "./side-panel";

// The frame picker: the whole library at once (the classic frames, shaped
// codes, QRdx's official frames and the frames you saved), with search, an
// action beside it (the Frame panel's Upload SVG), a chip per group and a
// "Coming up" group of the frames for the holidays and seasons ahead. It
// opens on the current choice. Official frames load a collection at a time
// as their tiles scroll into view; until then a tile keeps the frame's
// shape as a placeholder. The library is over a thousand frames, so the
// catalog mounts its tiles a page at a time as it scrolls, and search runs
// on a deferred copy of the query to keep typing smooth.

export const OFFICIAL_PREFIX = "official:";

/**
 * A tile the picker always has: a built-in frame, a shaped code, a saved
 * frame or the custom one.
 */
export interface FrameChoice {
  id: string;
  name: string;
  /** What the tile applies (a shaped code's is no frame) */
  frame: AnyQRFrame;
  group: "built-in" | "shape" | "saved" | "custom";
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

/** The scrolling element around `element` (null: the viewport). */
function scrollParent(element: Element | null): Element | null {
  for (let el = element?.parentElement; el; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el);
    if (overflowY === "auto" || overflowY === "scroll") return el;
  }
  return null;
}

/** Tiles mounted at first, and added each time the end comes near. */
const TILE_PAGE = 60;

/**
 * The picker opens on the current choice: in the whole library when it's
 * within this many tiles of the top, otherwise in its own group (so the
 * pages mounted to reach it stay few).
 */
const OPEN_WITHIN = TILE_PAGE * 3;

/**
 * Calls `onNear` when it comes within a few rows of the scrolling area's
 * visible part. Remount it (a new key) to check again after more tiles load.
 */
function MoreTiles({ onNear }: { onNear: () => void }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const callback = React.useRef(onNear);
  callback.current = onNear;
  React.useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") {
      callback.current();
      return;
    }
    const watcher = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          watcher.disconnect();
          callback.current();
        }
      },
      { root: scrollParent(element), rootMargin: "600px 0px" },
    );
    watcher.observe(element);
    return () => watcher.disconnect();
  }, []);
  return <div aria-hidden className="h-px" ref={ref} />;
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
const CLASSIC = "classic";
const SHAPES = "shapes";
const SAVED = "saved";

interface Section {
  id: string;
  label: string;
  items: { id: string; entry?: OfficialFrameIndexEntry }[];
}

/**
 * Where the picker opens to show `value`: the group to filter by (ALL for
 * the whole library) and how many tiles to mount so its tile is among
 * them. Null when there's nothing to show: no frame (the library opens at
 * the top, on what's coming up) or a choice that isn't a tile.
 */
export function openingPlace(
  sections: readonly Pick<Section, "id" | "items">[],
  value: string,
): { filter: string; count: number } | null {
  if (value === "none") return null;
  const pages = (at: number) =>
    Math.max(1, Math.ceil((at + 1) / TILE_PAGE)) * TILE_PAGE;
  let at = 0;
  for (const section of sections) {
    const i = section.items.findIndex((item) => item.id === value);
    if (i >= 0) {
      at += i;
      if (at < OPEN_WITHIN) return { filter: ALL, count: pages(at) };
      break;
    }
    at += section.items.length;
  }
  // Far down the library: open its own group (not "Coming up", which
  // only repeats frames from the collections)
  const own = sections.find(
    (section) =>
      section.id !== COMING_UP &&
      section.items.some((item) => item.id === value),
  );
  if (!own) return null;
  const i = own.items.findIndex((item) => item.id === value);
  return { filter: own.id, count: pages(i) };
}

export function FramePicker({
  value,
  choices,
  onPick,
  preview,
  active,
  currentName,
  action,
}: {
  /** The current choice: a FrameChoice id or "official:<id>" */
  value: string;
  choices: FrameChoice[];
  onPick: (id: string, frame: AnyQRFrame) => void;
  /** The preview drawing of a frame (fills a tile's white well) */
  preview: (frame: AnyQRFrame, id: string) => React.ReactNode;
  /** The picker is on screen: load what its tiles need */
  active: boolean;
  /** Name shown over the library for the current choice */
  currentName: string;
  /** Shown beside the search field (the Frame panel's Upload SVG) */
  action?: React.ReactNode;
}) {
  const t = useTranslations("editor.controlSections.framePicker");
  const inPanel = useInsideSidePanel();
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState(ALL);
  // Null until worked out in the browser (below)
  const [upcoming, setUpcoming] = React.useState<string[] | null>(null);
  const browserId = React.useId();
  const searchRef = React.useRef<HTMLInputElement>(null);
  const chipsRef = React.useRef<HTMLDivElement>(null);
  const [loadingId, setLoadingId] = React.useState<string | null>(null);
  const [indexFailed, setIndexFailed] = React.useState(false);

  // Re-render as the library loads; the index once the picker is on screen
  useFrameLibrary({ withIndex: active });
  const index = peekFrameIndex();
  React.useEffect(() => {
    if (!active) return;
    let live = true;
    loadFrameIndex().catch(() => {
      if (live) setIndexFailed(true);
    });
    return () => {
      live = false;
    };
  }, [active]);

  const byId = React.useMemo(
    () => new Map(choices.map((choice) => [choice.id, choice])),
    [choices],
  );

  // The current choice's official frame, for its tile
  React.useEffect(() => {
    if (!active) return;
    const official = officialId(value);
    if (official) loadOfficialFrame(official).catch(() => {});
  }, [active, value]);

  // What's coming up depends on today and where the viewer is: worked out
  // in the browser, after the static page has hydrated.
  React.useEffect(() => {
    if (!active) return;
    setUpcoming(
      upcomingOccasions(new Date(), viewerHemisphere()).map(
        (occasion) => occasion.id,
      ),
    );
  }, [active]);

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

  const officialCount = index?.length ?? 0;
  // "None" is a choice, not a frame; shaped codes are tiles, not frames
  const frameTotal =
    choices.filter((choice) => choice.id !== "none" && choice.group !== "shape")
      .length + officialCount;
  const total =
    frameTotal + choices.filter((choice) => choice.group === "shape").length;

  // ── Catalog contents ────────────────────────────────────────────────────
  // Typing stays responsive: the filtering and the tiles follow a beat later
  const deferredQuery = React.useDeferredValue(query);
  const terms = words(deferredQuery);
  const searchText = React.useMemo(
    () => new Map((index ?? []).map((entry) => [entry.id, entryText(entry)])),
    [index],
  );
  const sections: Section[] = React.useMemo(() => {
    const classic = choices.filter(
      (choice) => choice.group === "built-in" || choice.group === "custom",
    );
    const shapes = choices.filter((choice) => choice.group === "shape");
    const saved = choices.filter((choice) => choice.group === "saved");
    const entries = index ?? [];
    const byCollection = new Map<OfficialFrameCollection, Section["items"]>();
    for (const entry of entries) {
      const list = byCollection.get(entry.collection) ?? [];
      list.push({ id: `${OFFICIAL_PREFIX}${entry.id}`, entry });
      byCollection.set(entry.collection, list);
    }
    const order = new Map((upcoming ?? []).map((id, i) => [id, i]));
    const comingUp = entries
      .filter((entry) => entry.occasion && order.has(entry.occasion))
      .sort(
        (a, b) =>
          (order.get(a.occasion ?? "") ?? 0) -
          (order.get(b.occasion ?? "") ?? 0),
      )
      .map((entry) => ({ id: `${OFFICIAL_PREFIX}${entry.id}`, entry }));
    return [
      { id: COMING_UP, label: t("comingUp"), items: comingUp },
      {
        id: CLASSIC,
        label: t("classic"),
        items: classic.map((choice) => ({ id: choice.id })),
      },
      {
        id: SHAPES,
        label: t("shapedCodes"),
        items: shapes.map((choice) => ({ id: choice.id })),
      },
      ...OFFICIAL_FRAME_COLLECTIONS.map((collection) => ({
        id: collection.id,
        label: collection.label,
        items: byCollection.get(collection.id) ?? [],
      })),
      {
        id: SAVED,
        label: t("saved"),
        items: saved.map((choice) => ({ id: choice.id })),
      },
    ].filter((section) => section.items.length > 0);
  }, [choices, index, upcoming, t]);

  const shown: Section[] = (() => {
    if (terms.length > 0) {
      const found = new Map<string, Section["items"][number]>();
      for (const section of sections) {
        if (section.id === COMING_UP) continue;
        if (filter !== ALL && section.id !== filter) continue;
        for (const item of section.items) {
          const text = item.entry
            ? (searchText.get(item.entry.id) ?? entryText(item.entry))
            : `${nameOf(item.id)} ${item.id} ${byId.get(item.id)?.keywords ?? ""}`.toLowerCase();
          if (matches(text, terms)) found.set(item.id, item);
        }
      }
      return [
        { id: "results", label: t("results"), items: [...found.values()] },
      ];
    }
    if (filter === ALL) return sections;
    return sections.filter((section) => section.id === filter);
  })();
  const resultCount = shown.reduce((sum, s) => sum + s.items.length, 0);

  // Mount the first tiles only, and more as the list scrolls (a new search
  // or group starts again from the top)
  const viewOf = (group: string, searched: string[]) =>
    `${group}|${searched.join(" ")}`;
  const view = viewOf(filter, terms);
  const [mounted, setMounted] = React.useState({ view, count: TILE_PAGE });
  const tileLimit = mounted.view === view ? mounted.count : TILE_PAGE;
  const showMoreTiles = () =>
    setMounted({ view, count: tileLimit + TILE_PAGE });
  let budget = tileLimit;
  const mountedSections = shown
    .map((section) => {
      const items = section.items.slice(0, Math.max(0, budget));
      budget -= items.length;
      return { ...section, items };
    })
    .filter((section) => section.items.length > 0);

  // Opening the panel puts search under the cursor (not on touch screens,
  // where focus would pop the keyboard)
  React.useEffect(() => {
    if (!(active && inPanel)) return;
    if (window.matchMedia("(pointer: fine)").matches) {
      searchRef.current?.focus({ preventScroll: true });
    }
  }, [active, inPanel]);

  const gridId = `${browserId}-grid`;

  // Open on the current choice, once the groups above it have settled (the
  // library's index and what's coming up): mount the tiles down to it, or
  // open its own group when it's far down, then scroll it into view. Only
  // on opening: a tile picked later is already in view.
  const settled =
    active && upcoming !== null && (Boolean(index) || indexFailed);
  const [placed, setPlaced] = React.useState(false);
  const scrolled = React.useRef(false);
  React.useEffect(() => {
    if (placed || !settled) return;
    setPlaced(true);
    // Not if the viewer has already searched or picked a group
    if (query !== "" || filter !== ALL) return;
    const place = openingPlace(sections, value);
    if (!place) return;
    setFilter(place.filter);
    setMounted({ view: viewOf(place.filter, []), count: place.count });
  });
  React.useEffect(() => {
    if (!placed || scrolled.current) return;
    scrolled.current = true;
    if (value === "none") return;
    // The group it opened in, among the chips
    const bar = chipsRef.current;
    const chip = bar?.querySelector<HTMLElement>('button[aria-pressed="true"]');
    if (bar && chip && filter !== ALL) {
      bar.scrollLeft +=
        chip.getBoundingClientRect().left -
        bar.getBoundingClientRect().left -
        16;
    }
    const grid = document.getElementById(gridId);
    const tile = grid?.querySelector<HTMLElement>(
      'button[aria-pressed="true"]',
    );
    if (!(grid && tile)) return;
    // Scroll the grid only (scrollIntoView would move the page too)
    const box = grid.getBoundingClientRect();
    const at = tile.getBoundingClientRect();
    grid.scrollTop = Math.max(
      0,
      grid.scrollTop + at.top - box.top - (box.height - at.height) / 2,
    );
  });

  const focusGrid = () => {
    const root = document.getElementById(gridId);
    const target =
      root?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]') ??
      root?.querySelector<HTMLButtonElement>("fieldset button");
    target?.focus();
  };

  const chips = [
    { id: ALL, label: t("all"), count: total },
    ...sections.map((section) => ({
      id: section.id,
      label: section.label,
      count: section.items.filter((item) => item.id !== "none").length,
    })),
  ];

  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-muted-foreground font-medium">{t("frame")}</span>
        <span className="text-foreground min-w-0 truncate font-medium">
          {currentName}
        </span>
      </div>

      <div className="space-y-2.5">
        <div className="flex items-center gap-1.5">
          <div className="relative min-w-0 flex-1">
            <SearchNormal1
              aria-hidden
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2"
            />
            <Input
              aria-label={t("searchFrames")}
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
                  ? t("searchTotalFrames", { total: frameTotal })
                  : t("searchFrames")
              }
              ref={searchRef}
              type="search"
              value={query}
            />
          </div>
          {action}
        </div>

        <div
          aria-label={t("filterFrames")}
          className="no-scrollbar -mx-2.5 flex gap-0.5 overflow-x-auto px-2.5 [mask-image:linear-gradient(to_right,transparent,black_10px,black_calc(100%-16px),transparent)]"
          ref={chipsRef}
          role="toolbar"
        >
          {chips.map((chip) => (
            <Button
              aria-pressed={filter === chip.id}
              className="h-7 shrink-0 gap-1 px-2 text-xs"
              key={chip.id}
              onClick={(event) => {
                setFilter(chip.id);
                event.currentTarget.scrollIntoView({
                  block: "nearest",
                  inline: "nearest",
                });
              }}
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
          className="-mx-1 max-h-[24rem] space-y-4 overflow-y-auto overscroll-contain px-1 pt-1 pb-1"
          id={gridId}
        >
          {mountedSections.map((section) => (
            <section aria-label={section.label} key={section.id}>
              {(shown.length > 1 || section.id === COMING_UP) && (
                <h4 className="text-muted-foreground mb-2 flex items-baseline justify-between text-xs font-medium">
                  <span>{section.label}</span>
                  {section.id === COMING_UP && upcoming && (
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
              <OptionGrid label={t("labelFrames", { label: section.label })}>
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
          {resultCount > tileLimit && (
            <MoreTiles key={tileLimit} onNear={showMoreTiles} />
          )}
        </div>
      ) : (
        <div className="text-muted-foreground flex flex-col items-center gap-2 py-6 text-center text-xs">
          {index || terms.length > 0
            ? t("noFramesMatchQuery", { query })
            : t("loadingFrames")}
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
              {t("showAll")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
