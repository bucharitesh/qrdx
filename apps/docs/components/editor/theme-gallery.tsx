"use client";

import { Tick } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Kbd } from "@repo/design-system/components/ui/kbd";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogTitle,
} from "@repo/design-system/components/ui/revola";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowRotateLeft, SearchNormal1, Shuffle } from "iconsax-reactjs";
import { QRCodeSVG } from "qrdx";
import * as React from "react";
import { DialogCloseButton } from "@/components/editor/dialog-close-button";
import { seasonalPresetsFirst } from "@/components/seasonal/preset-order";
import { useThemeShuffle } from "@/lib/hooks/use-theme-shuffle";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  DARK_THEME_NOTE,
} from "@/lib/themes/categories";
import { shuffleSeed, shuffleTheme } from "@/lib/themes/shuffle";
import { useQREditorStore } from "@/store/editor-store";
import type { ThemeCategory, ThemeStyles } from "@/types/theme";
import { defaultPresets } from "@/utils/qr-presets";

const THUMB_VALUE = "https://qrdx.dev";

interface GalleryItem {
  id: string;
  label: string;
  category: ThemeCategory;
  styles: ThemeStyles;
  search: string;
}

const ITEMS: GalleryItem[] = (() => {
  const order = new Map(CATEGORY_ORDER.map((category, i) => [category, i]));
  return seasonalPresetsFirst(Object.keys(defaultPresets))
    .map((id, index) => {
      const preset = defaultPresets[id];
      if (!preset) return null;
      const category = preset.category ?? "brand";
      const label = preset.label ?? id;
      return {
        index,
        item: {
          id,
          label,
          category,
          styles: preset.styles,
          search: [label, CATEGORY_LABELS[category], ...(preset.tags ?? [])]
            .join(" ")
            .toLowerCase(),
        },
      };
    })
    .filter((entry) => entry !== null)
    .sort(
      (a, b) =>
        (order.get(a.item.category) ?? 99) -
          (order.get(b.item.category) ?? 99) || a.index - b.index,
    )
    .map((entry) => entry.item);
})();

const CATEGORIES = CATEGORY_ORDER.filter((category) =>
  ITEMS.some((item) => item.category === category),
);

/** Renders its QR code only once it scrolls near the viewport. */
function LazyThumb({ styles, size }: { styles: ThemeStyles; size: number }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const element = ref.current;
    if (!element || visible) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "240px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <span
      className="grid place-items-center"
      ref={ref}
      style={{ width: size, height: size }}
    >
      {visible && (
        <QRCodeSVG
          bgColor={styles.bgColor}
          bodyPattern={styles.bodyPattern}
          cornerEyeDotPattern={styles.cornerEyeDotPattern}
          cornerEyePattern={styles.cornerEyePattern}
          dotColor={styles.dotColor}
          eyeColor={styles.eyeColor}
          fgColor={styles.fgColor}
          frame={styles.frame}
          level={styles.level}
          margin={Math.min(styles.margin ?? 0, 3)}
          size={size}
          style={{
            maxWidth: size,
            maxHeight: size,
            width: "auto",
            height: "auto",
          }}
          value={THUMB_VALUE}
        />
      )}
    </span>
  );
}

const ThemeTile = React.memo(function ThemeTile({
  item,
  current,
  onApply,
}: {
  item: GalleryItem;
  current: boolean;
  onApply: (id: string) => void;
}) {
  const dark = item.category === "dark";
  return (
    <button
      aria-label={`${item.label}, ${CATEGORY_LABELS[item.category]}${dark ? `. ${DARK_THEME_NOTE}` : ""}`}
      aria-pressed={current}
      className={cn(
        "group flex min-w-0 flex-col items-center gap-1.5 rounded-xl p-1.5 pb-2 text-center transition-colors outline-none",
        "hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:ring-ring/40 focus-visible:ring-[3px]",
        current && "bg-accent/60",
      )}
      data-gallery-tile=""
      onClick={() => onApply(item.id)}
      title={dark ? DARK_THEME_NOTE : undefined}
      type="button"
    >
      <span
        className={cn(
          "bg-muted/30 relative grid size-[88px] place-items-center overflow-hidden rounded-[12px] ring-1 ring-black/5 transition-transform group-active:scale-[0.97] dark:ring-white/10",
          current && "ring-foreground/50 ring-2 dark:ring-foreground/60",
        )}
      >
        <LazyThumb size={80} styles={item.styles} />
        {current && (
          <span className="bg-foreground text-background absolute top-1 right-1 grid size-4 place-items-center rounded-full shadow-sm">
            <Tick className="size-2.5" />
          </span>
        )}
      </span>
      <span className="w-full min-w-0">
        <span
          className={cn(
            "block truncate text-xs leading-4 font-medium",
            !current && "text-foreground/85",
          )}
        >
          {item.label}
        </span>
        <span className="text-muted-foreground/80 block truncate text-[10px] leading-3.5">
          {CATEGORY_LABELS[item.category]}
        </span>
      </span>
    </button>
  );
});

/** Finds the tile to move to with the arrow keys, by on-screen position. */
function nextTile(tiles: HTMLElement[], from: HTMLElement, key: string) {
  const index = tiles.indexOf(from);
  if (key === "ArrowLeft") return tiles[index - 1];
  if (key === "ArrowRight") return tiles[index + 1];
  if (key === "Home") return tiles[0];
  if (key === "End") return tiles.at(-1);
  const origin = from.getBoundingClientRect();
  let best: HTMLElement | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const tile of tiles) {
    const rect = tile.getBoundingClientRect();
    const dy = rect.top - origin.top;
    if (key === "ArrowDown" ? dy <= 4 : dy >= -4) continue;
    const score = Math.abs(dy) * 1000 + Math.abs(rect.left - origin.left);
    if (score < bestScore) {
      bestScore = score;
      best = tile;
    }
  }
  return best;
}

/** The look Shuffle just applied, with a way back. */
function ShuffleCard({ seed }: { seed: number }) {
  const theme = shuffleTheme(seed);
  const { back, canGoBack } = useThemeShuffle();
  return (
    <div className="bg-muted/30 flex items-center gap-3 rounded-xl border p-2 pr-3">
      <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-[10px] ring-1 ring-black/5 dark:ring-white/10">
        <LazyThumb size={52} styles={theme.styles} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{theme.name}</span>
        <span className="text-muted-foreground block truncate text-xs">
          Shuffled · {CATEGORY_LABELS[theme.category]}
          {theme.inverted ? ` · ${DARK_THEME_NOTE.toLowerCase()}` : ""}
        </span>
      </span>
      <Button
        disabled={!canGoBack}
        onClick={back}
        size="sm"
        type="button"
        variant="ghost"
      >
        <ArrowRotateLeft className="size-4" />
        Back
      </Button>
    </div>
  );
}

interface ThemeGalleryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Every built-in theme as a live QR thumbnail, plus Shuffle. */
export function ThemeGallery({ open, onOpenChange }: ThemeGalleryProps) {
  const currentId = useQREditorStore((state) => state.themeState.preset);
  const applyThemePreset = useQREditorStore((state) => state.applyThemePreset);
  const { shuffle } = useThemeShuffle();
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState<ThemeCategory | "all">("all");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    setQuery("");
    const frame = requestAnimationFrame(() => {
      if (window.matchMedia("(pointer: fine)").matches) {
        inputRef.current?.focus();
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const tokens = React.useMemo(
    () => query.trim().toLowerCase().split(/\s+/).filter(Boolean),
    [query],
  );

  const items = React.useMemo(
    () =>
      ITEMS.filter(
        (item) =>
          (tokens.length > 0 ||
            category === "all" ||
            item.category === category) &&
          tokens.every((token) => item.search.includes(token)),
      ),
    [tokens, category],
  );

  const apply = React.useCallback(
    (id: string) => {
      applyThemePreset(id);
      onOpenChange(false);
    },
    [applyThemePreset, onOpenChange],
  );

  const shuffled = shuffleSeed(currentId);

  const handleListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const from = event.target as HTMLElement;
    if (!from.hasAttribute("data-gallery-tile")) return;
    if (
      event.key.toLowerCase() === "t" &&
      !(event.metaKey || event.ctrlKey || event.altKey)
    ) {
      // Handled here so the playground's own T shortcut doesn't fire too.
      event.preventDefault();
      event.stopPropagation();
      shuffle();
      return;
    }
    if (
      ![
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
      ].includes(event.key)
    ) {
      return;
    }
    event.preventDefault();
    const tiles = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>("[data-gallery-tile]") ??
        [],
    );
    const next = nextTile(tiles, from, event.key);
    if (next) {
      next.focus();
      next.scrollIntoView({ block: "nearest" });
    } else if (event.key === "ArrowUp") {
      inputRef.current?.focus();
    }
  };

  const handleSearchKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === "Enter" && tokens.length && items[0]) {
      event.preventDefault();
      apply(items[0].id);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      listRef.current
        ?.querySelector<HTMLElement>("[data-gallery-tile]")
        ?.focus();
    }
  };

  const countFor = (id: ThemeCategory) =>
    ITEMS.filter((item) => item.category === id).length;

  return (
    <ResponsiveDialog onOpenChange={onOpenChange} open={open}>
      <ResponsiveDialogContent className="max-h-[92dvh] gap-0 overflow-hidden p-0 sm:max-w-3xl dark:!border-border">
        <div className="flex h-[84dvh] flex-col sm:h-[min(680px,86dvh)]">
          <div className="flex items-start gap-3 px-4 pt-1 pb-3 sm:px-5 sm:pt-4">
            <div className="min-w-0 flex-1">
              <ResponsiveDialogTitle className="text-base">
                Themes
              </ResponsiveDialogTitle>
              <ResponsiveDialogDescription className="mt-1 text-xs">
                {ITEMS.length} built-in looks, each tested to scan. Or shuffle a
                new one.
              </ResponsiveDialogDescription>
            </div>
            <DialogCloseButton className="-mt-1 -mr-1 hidden sm:inline-flex" />
          </div>

          <div className="space-y-3 border-b px-4 pb-3 sm:px-5">
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <SearchNormal1 className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                  aria-label="Search themes"
                  className="h-10 pl-9"
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Search: menu, gold, pastel, dots…"
                  ref={inputRef}
                  type="search"
                  value={query}
                />
              </div>
              <Button
                className="h-10 shrink-0"
                onClick={shuffle}
                type="button"
                variant="outline"
              >
                <Shuffle className="size-4" />
                Shuffle
              </Button>
            </div>

            {shuffled !== null && <ShuffleCard seed={shuffled} />}

            <div
              aria-label="Categories"
              className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [mask-image:linear-gradient(to_right,transparent,black_16px,black_calc(100%-24px),transparent)] [scrollbar-width:none] sm:-mx-5 sm:px-5"
              role="toolbar"
            >
              {(["all", ...CATEGORIES] as const).map((id) => {
                const active = !tokens.length && category === id;
                return (
                  <Button
                    aria-pressed={active}
                    className={cn(
                      "h-7 shrink-0 gap-1.5 px-2.5 text-xs font-normal",
                      active && "font-medium",
                    )}
                    key={id}
                    onClick={() => {
                      setQuery("");
                      setCategory(id);
                      listRef.current?.scrollTo({ top: 0 });
                    }}
                    size="sm"
                    type="button"
                    variant={active ? "secondary" : "ghost"}
                  >
                    {id === "all" ? "All" : CATEGORY_LABELS[id]}
                    <span className="text-muted-foreground/70 tabular-nums">
                      {id === "all" ? ITEMS.length : countFor(id)}
                    </span>
                  </Button>
                );
              })}
            </div>
          </div>

          {/* biome-ignore lint/a11y/noStaticElementInteractions: arrow-key navigation between the tiles inside */}
          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4"
            onKeyDown={handleListKeyDown}
            ref={listRef}
          >
            {category === "dark" && !tokens.length && (
              <p className="text-muted-foreground px-1.5 pb-2 text-xs">
                Light codes on a dark background. {DARK_THEME_NOTE}, so test
                with the phones your audience uses.
              </p>
            )}
            {items.length ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-x-1 gap-y-1.5">
                {items.map((item) => (
                  <ThemeTile
                    current={item.id === currentId}
                    item={item}
                    key={item.id}
                    onApply={apply}
                  />
                ))}
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 py-10 text-center">
                <p className="text-muted-foreground max-w-64 text-sm text-pretty">
                  No theme matches “{query.trim()}”.
                </p>
                <Button
                  onClick={shuffle}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <Shuffle className="size-4" />
                  Shuffle one instead
                </Button>
              </div>
            )}
          </div>

          <div className="text-muted-foreground hidden items-center gap-4 border-t px-5 py-2 text-xs sm:flex">
            <span className="flex items-center gap-1">
              <Kbd>←</Kbd>
              <Kbd>→</Kbd>
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              to move
            </span>
            <span className="flex items-center gap-1">
              <Kbd>↵</Kbd> to apply
            </span>
            <span className="flex items-center gap-1">
              <Kbd>T</Kbd> to shuffle
            </span>
            <span className="ml-auto flex items-center gap-1">
              <Kbd>esc</Kbd> to close
            </span>
          </div>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
