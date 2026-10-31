"use client";

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
import {
  ArrowRight,
  Clock,
  Element4,
  type Icon,
  SearchNormal1,
} from "iconsax-reactjs";
import { useRouter } from "next/navigation";
import * as React from "react";
import {
  getTypeIcon,
  TypeIconTile,
} from "@/components/editor/content-type-icons";
import { DialogCloseButton } from "@/components/editor/dialog-close-button";
import { InfoHint } from "@/components/help/info-hint";
import type { BlockIcon } from "@/lib/landing/registry";
import { soundEvent } from "@/lib/sound/emit";
import { useQREditorStore } from "@/store/editor-store";
import {
  CONTENT_CATEGORIES,
  CONTENT_TYPES_METADATA,
  type ContentType,
  type ContentTypeMetadata,
} from "@/types/qr-content";

const RECENT_KEY = "qrdx:recent-qr-types";
const MAX_RECENT = 4;
const PAGES_SECTION = "hosted-pages";

const META_BY_TYPE = new Map<ContentType, ContentTypeMetadata>(
  CONTENT_TYPES_METADATA.map((meta) => [meta.type, meta]),
);

/** Search words for the hosted page types (labels come from the template registry). */
const PAGE_KEYWORDS: Record<string, string[]> = {
  links: ["link in bio", "linktree", "bio", "links", "social"],
  business: ["store", "hours", "shop", "restaurant", "local"],
  vcard: ["business card", "digital business card", "contact", "vcard"],
  pdf: ["brochure", "document", "manual", "catalog", "file"],
  images: ["gallery", "photos", "pictures", "portfolio"],
  mp3: ["audio", "podcast", "music", "song", "voice"],
  video: ["youtube", "vimeo", "loom", "film"],
  menu: ["restaurant", "cafe", "food", "drinks", "bar"],
  coupon: ["discount", "offer", "deal", "voucher", "promo"],
  event: ["ticket", "rsvp", "invitation", "wedding", "party"],
  apps: ["app store", "play store", "download", "ios", "android"],
  feedback: ["survey", "nps", "form", "rating", "review", "sign-up"],
  custom: ["landing page", "blank", "page", "website"],
};

interface TypeItem {
  kind: "type";
  key: string;
  type: ContentType;
  label: string;
  description: string;
  icon: string;
  keywords: string[];
}

interface PageItem {
  kind: "page";
  key: string;
  pageType: string;
  label: string;
  description: string;
  Icon: BlockIcon;
  keywords: string[];
}

type PickerItem = TypeItem | PageItem;

interface PickerSection {
  id: string;
  label: string;
  Icon: Icon | React.ComponentType<{ className?: string }>;
  description?: string;
  items: PickerItem[];
}

function typeItem(type: ContentType): TypeItem | null {
  const meta = META_BY_TYPE.get(type);
  if (!meta) return null;
  return {
    kind: "type",
    key: `type:${meta.type}`,
    type: meta.type,
    label: meta.label,
    description: meta.description,
    icon: meta.icon,
    keywords: meta.keywords ?? [],
  };
}

const TYPE_SECTIONS: PickerSection[] = CONTENT_CATEGORIES.map((category) => ({
  id: category.id,
  label: category.label,
  Icon: getTypeIcon(category.icon),
  items: category.types
    .map(typeItem)
    .filter((item): item is TypeItem => item !== null),
}));

const ALL_TYPE_ITEMS = CONTENT_TYPES_METADATA.map((meta) =>
  typeItem(meta.type),
).filter((item): item is TypeItem => item !== null);

/** Ranks an item for a query; 0 means it doesn't match every word. */
function scoreItem(item: PickerItem, query: string, tokens: string[]) {
  const label = item.label.toLowerCase();
  const words = label.split(/[^a-z0-9.]+/).filter(Boolean);
  const description = item.description.toLowerCase();
  const keywords = item.keywords.map((keyword) => keyword.toLowerCase());
  let total = 0;
  for (const token of tokens) {
    let best = 0;
    if (label === token) best = 100;
    else if (label.startsWith(token)) best = 80;
    else if (keywords.includes(token)) best = 75;
    else if (words.some((word) => word.startsWith(token))) best = 60;
    else if (
      keywords.some((keyword) =>
        keyword.split(/\s+/).some((word) => word.startsWith(token)),
      )
    )
      best = 50;
    else if (label.includes(token)) best = 40;
    else if (keywords.some((keyword) => keyword.includes(token))) best = 30;
    else if (token.length > 2 && description.includes(token)) best = 15;
    if (best === 0) return 0;
    total += best;
  }
  if (tokens.length > 1 && (keywords.includes(query) || label === query)) {
    total += 50;
  }
  if (item.kind === "page") total -= 5;
  return total;
}

function readRecent(): ContentType[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (type): type is ContentType =>
          typeof type === "string" && META_BY_TYPE.has(type as ContentType),
      )
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

function rememberRecent(type: ContentType) {
  try {
    const next = [type, ...readRecent().filter((item) => item !== type)];
    window.localStorage.setItem(
      RECENT_KEY,
      JSON.stringify(next.slice(0, MAX_RECENT)),
    );
  } catch {
    // Storage can be unavailable (private mode); recents are optional.
  }
}

type TemplatesModule = typeof import("@/lib/landing/templates");

/** Hosted page types, loaded only while the picker is open. */
function usePageItems(open: boolean): PageItem[] | null {
  const [items, setItems] = React.useState<PageItem[] | null>(null);
  React.useEffect(() => {
    if (!open || items) return;
    let cancelled = false;
    import("@/lib/landing/templates")
      .then((mod: TemplatesModule) => {
        if (cancelled) return;
        setItems(
          mod.listTemplates().map((template) => ({
            kind: "page",
            key: `page:${template.type}`,
            pageType: template.type,
            label: template.label,
            description: template.description,
            Icon: template.icon,
            keywords: PAGE_KEYWORDS[template.type] ?? [],
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, items]);
  return items;
}

/** Finds the tile to move to with the arrow keys, by on-screen position. */
function findNextTile(
  tiles: HTMLElement[],
  from: HTMLElement,
  key: string,
): HTMLElement | undefined {
  const index = tiles.indexOf(from);
  if (key === "ArrowLeft") return tiles[index - 1];
  if (key === "ArrowRight") return tiles[index + 1];
  if (key === "Home") return tiles[0];
  if (key === "End") return tiles.at(-1);
  const origin = from.getBoundingClientRect();
  const originX = origin.left + origin.width / 2;
  let best: HTMLElement | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const tile of tiles) {
    if (tile === from) continue;
    const rect = tile.getBoundingClientRect();
    const dy = rect.top - origin.top;
    if (key === "ArrowDown" ? dy <= 4 : dy >= -4) continue;
    const score =
      Math.abs(dy) * 1000 + Math.abs(rect.left + rect.width / 2 - originX);
    if (score < bestScore) {
      bestScore = score;
      best = tile;
    }
  }
  return best;
}

interface ContentTypeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ContentTypeModal({
  open,
  onOpenChange,
}: ContentTypeModalProps) {
  const router = useRouter();
  const contentType = useQREditorStore((state) => state.contentType);
  const setContentType = useQREditorStore((state) => state.setContentType);
  const pageItems = usePageItems(open);
  const [query, setQuery] = React.useState("");
  const [recent, setRecent] = React.useState<ContentType[]>([]);
  const [activeSection, setActiveSection] = React.useState(
    TYPE_SECTIONS[0]?.id ?? "",
  );
  const inputRef = React.useRef<HTMLInputElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const spyLockRef = React.useRef(0);

  const trimmed = query.trim().toLowerCase();
  const tokens = React.useMemo(
    () => trimmed.split(/\s+/).filter(Boolean),
    [trimmed],
  );

  React.useEffect(() => {
    if (!open) return;
    setQuery("");
    setRecent(readRecent());
    setActiveSection(TYPE_SECTIONS[0]?.id ?? "");
    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: 0 });
      // Skip on touch screens so the keyboard doesn't cover the list.
      if (window.matchMedia("(pointer: fine)").matches) {
        inputRef.current?.focus();
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const sections = React.useMemo<PickerSection[]>(() => {
    if (!pageItems?.length) return TYPE_SECTIONS;
    return [
      ...TYPE_SECTIONS,
      {
        id: PAGES_SECTION,
        label: "Hosted pages",
        Icon: Element4,
        description:
          "Mobile pages QRdx hosts for you, each with a dynamic QR code. Opens in your dashboard.",
        items: pageItems,
      },
    ];
  }, [pageItems]);

  const results = React.useMemo(() => {
    if (!tokens.length) return [];
    const pool: PickerItem[] = [...ALL_TYPE_ITEMS, ...(pageItems ?? [])];
    return pool
      .map((item, index) => ({
        item,
        index,
        score: scoreItem(item, trimmed, tokens),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map((entry) => entry.item);
  }, [tokens, trimmed, pageItems]);

  const recentItems = React.useMemo(
    () =>
      recent.map(typeItem).filter((item): item is TypeItem => item !== null),
    [recent],
  );

  // Scroll-spy: the section whose header sits in the top band of the list is active.
  React.useEffect(() => {
    const root = scrollRef.current;
    if (!open || !root || tokens.length) return;
    const visible = new Set<string>();
    const order = sections.map((section) => section.id);
    let atEnd = false;
    const pick = () => {
      if (Date.now() < spyLockRef.current) return;
      const id = atEnd ? order.at(-1) : order.find((item) => visible.has(item));
      if (id) setActiveSection(id);
    };
    const band = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.sectionId;
          if (!id) continue;
          if (entry.isIntersecting) visible.add(id);
          else visible.delete(id);
        }
        pick();
      },
      { root, rootMargin: "0px 0px -70% 0px", threshold: 0 },
    );
    const end = new IntersectionObserver(
      ([entry]) => {
        atEnd = Boolean(entry?.isIntersecting);
        pick();
      },
      { root, threshold: 1 },
    );
    for (const element of root.querySelectorAll<HTMLElement>(
      "[data-section-id]",
    )) {
      band.observe(element);
    }
    const sentinel = root.querySelector("[data-spy-end]");
    if (sentinel) end.observe(sentinel);
    return () => {
      band.disconnect();
      end.disconnect();
    };
  }, [open, sections, tokens.length]);

  const selectItem = (item: PickerItem) => {
    if (item.kind === "page") {
      onOpenChange(false);
      router.push(`/dashboard/pages?new=${encodeURIComponent(item.pageType)}`);
      return;
    }
    setContentType(item.type);
    soundEvent("select");
    rememberRecent(item.type);
    onOpenChange(false);
  };

  const jumpToSection = (id: string) => {
    const root = scrollRef.current;
    const target = root?.querySelector<HTMLElement>(
      `[data-section-id="${id}"]`,
    );
    if (!(root && target)) return;
    setQuery("");
    setActiveSection(id);
    spyLockRef.current = Date.now() + 700;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    root.scrollTo({
      top: target.offsetTop - 12,
      behavior: reduce ? "auto" : "smooth",
    });
  };

  const tiles = () =>
    Array.from(
      scrollRef.current?.querySelectorAll<HTMLElement>("[data-picker-tile]") ??
        [],
    );

  const handleListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const from = event.target as HTMLElement;
    if (!from.hasAttribute("data-picker-tile")) return;
    if (
      event.key.length === 1 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey
    ) {
      inputRef.current?.focus();
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
    const next = findNextTile(tiles(), from, event.key);
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
    if (event.key === "Enter") {
      event.preventDefault();
      const first = tokens.length ? results[0] : undefined;
      if (first) selectItem(first);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const [first] = tiles();
      first?.focus();
    }
  };

  const renderTile = (item: PickerItem, highlighted = false) => {
    const isCurrent = item.kind === "type" && item.type === contentType;
    return (
      <button
        aria-current={isCurrent ? "true" : undefined}
        className={cn(
          "group bg-card flex w-full min-w-0 items-center gap-3 rounded-lg border p-2.5 text-left transition-colors outline-none",
          "hover:border-foreground/15 hover:bg-accent/40",
          "focus-visible:border-foreground/25 focus-visible:bg-accent/40 focus-visible:ring-ring/40 focus-visible:ring-[3px]",
          isCurrent && "border-foreground/20 bg-accent/50",
          highlighted && "border-foreground/20 bg-accent/60",
        )}
        data-picker-tile=""
        key={item.key}
        onClick={() => selectItem(item)}
        type="button"
      >
        {item.kind === "type" ? (
          <TypeIconTile icon={item.icon} type={item.type} />
        ) : (
          <span className="bg-muted/40 text-foreground/80 grid size-9 shrink-0 place-items-center rounded-lg border">
            <item.Icon className="size-4" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-sm leading-5 font-medium">
            <span className="truncate">{item.label}</span>
            {isCurrent && (
              <span className="text-muted-foreground shrink-0 rounded-full border px-1.5 text-[10px] leading-4 font-medium">
                Current
              </span>
            )}
          </span>
          <span className="text-muted-foreground block truncate text-xs leading-4">
            {item.description}
          </span>
        </span>
        {item.kind === "page" ? (
          <ArrowRight className="text-muted-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
        ) : highlighted ? (
          <Kbd className="hidden shrink-0 sm:inline-flex">↵</Kbd>
        ) : null}
      </button>
    );
  };

  const grid =
    "grid gap-2 sm:grid-cols-2 sm:[&>*:last-child:nth-child(odd)]:col-span-2";

  return (
    <ResponsiveDialog onOpenChange={onOpenChange} open={open}>
      <ResponsiveDialogContent className="max-h-[92dvh] gap-0 overflow-hidden p-0 sm:max-w-4xl dark:!border-border">
        <div className="flex h-[82dvh] flex-col sm:h-[min(640px,85dvh)]">
          <div className="flex items-start gap-3 px-4 pt-1 pb-3 sm:px-5 sm:pt-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <ResponsiveDialogTitle className="text-base">
                  Choose a QR code type
                </ResponsiveDialogTitle>
                <InfoHint align="start" id="qr-types" side="bottom" />
              </div>
              <ResponsiveDialogDescription className="mt-1 text-xs">
                What should happen when someone scans your code?
              </ResponsiveDialogDescription>
            </div>
            <DialogCloseButton className="-mt-1 -mr-1 hidden sm:inline-flex" />
          </div>

          <div className="space-y-3 border-b px-4 pb-3 sm:px-5">
            <div className="relative">
              <SearchNormal1 className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                aria-label="Search QR code types"
                className="h-10 pr-24 pl-9"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search: Wi-Fi, menu, gpay, business card…"
                ref={inputRef}
                type="search"
                value={query}
              />
              {tokens.length > 0 && results.length > 0 && (
                <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 items-center gap-1 text-xs sm:flex">
                  <Kbd>↵</Kbd> to pick
                </span>
              )}
            </div>

            {recentItems.length > 0 && !tokens.length && (
              <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none]">
                <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs">
                  <Clock className="size-3.5" />
                  Recent
                </span>
                {recentItems.map((item) => {
                  const ItemIcon = getTypeIcon(item.icon);
                  return (
                    <Button
                      className={cn(
                        "h-7 shrink-0 text-xs",
                        item.type === contentType && "bg-accent",
                      )}
                      key={item.key}
                      onClick={() => selectItem(item)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <ItemIcon className="size-3.5" />
                      {item.label}
                    </Button>
                  );
                })}
              </div>
            )}

            {!tokens.length && (
              <nav
                aria-label="Categories"
                className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [mask-image:linear-gradient(to_right,transparent,black_16px,black_calc(100%-24px),transparent)] [scrollbar-width:none] sm:hidden"
              >
                {sections.map((section) => (
                  <Button
                    className="h-7 shrink-0 text-xs"
                    key={section.id}
                    onClick={() => jumpToSection(section.id)}
                    size="sm"
                    type="button"
                    variant={
                      activeSection === section.id ? "secondary" : "outline"
                    }
                  >
                    {section.label}
                  </Button>
                ))}
              </nav>
            )}
          </div>

          <div className="flex min-h-0 flex-1">
            <nav
              aria-label="Categories"
              className="hidden w-52 shrink-0 flex-col gap-0.5 overflow-y-auto border-r p-2 sm:flex"
            >
              {sections.map((section) => {
                const isActive = !tokens.length && activeSection === section.id;
                return (
                  <Button
                    aria-current={isActive ? "true" : undefined}
                    className={cn(
                      "text-muted-foreground w-full justify-start gap-2.5 font-normal",
                      isActive && "bg-accent text-foreground font-medium",
                    )}
                    key={section.id}
                    onClick={() => jumpToSection(section.id)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <section.Icon className="size-4" />
                    <span className="flex-1 truncate text-left">
                      {section.label}
                    </span>
                    <span className="text-muted-foreground/70 text-xs tabular-nums">
                      {section.items.length}
                    </span>
                  </Button>
                );
              })}
            </nav>

            {/* biome-ignore lint/a11y/noStaticElementInteractions: arrow-key navigation between the tiles inside */}
            <div
              className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5"
              onKeyDown={handleListKeyDown}
              ref={scrollRef}
            >
              {tokens.length ? (
                results.length ? (
                  <section>
                    <h3 className="text-muted-foreground mb-2 text-xs font-medium">
                      {results.length}{" "}
                      {results.length === 1 ? "match" : "matches"} for “
                      {query.trim()}”
                    </h3>
                    <div className={grid}>
                      {results.map((item, index) =>
                        renderTile(item, index === 0),
                      )}
                    </div>
                  </section>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-3 py-10 text-center">
                    <span className="bg-muted/40 text-foreground/80 grid size-9 place-items-center rounded-full border">
                      <SearchNormal1 className="size-4" />
                    </span>
                    <p className="text-muted-foreground max-w-64 text-sm text-pretty">
                      No type matches “{query.trim()}”. A URL code works for any
                      web address.
                    </p>
                    <Button
                      onClick={() => {
                        const url = typeItem("url");
                        if (url) selectItem(url);
                      }}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Use a URL code
                    </Button>
                  </div>
                )
              ) : (
                <div className="space-y-6">
                  {sections.map((section) => (
                    <section
                      aria-labelledby={`picker-${section.id}`}
                      className="scroll-mt-3"
                      data-section-id={section.id}
                      key={section.id}
                    >
                      <div className="mb-2">
                        <h3
                          className="text-muted-foreground text-xs font-medium tracking-wider uppercase"
                          id={`picker-${section.id}`}
                        >
                          {section.label}
                        </h3>
                        {section.description && (
                          <p className="text-muted-foreground mt-1 text-xs text-pretty">
                            {section.description}
                          </p>
                        )}
                        {section.id === PAGES_SECTION && (
                          <a
                            className="text-muted-foreground hover:text-foreground mt-1 inline-block text-xs underline underline-offset-4"
                            href="/templates"
                            rel="noopener"
                            target="_blank"
                          >
                            Preview every template
                          </a>
                        )}
                      </div>
                      <div className={grid}>
                        {section.items.map((item) => renderTile(item))}
                      </div>
                    </section>
                  ))}
                  <div aria-hidden className="h-px" data-spy-end="" />
                </div>
              )}
            </div>
          </div>

          <div className="text-muted-foreground hidden items-center gap-4 border-t px-5 py-2 text-xs sm:flex">
            <span className="flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              <Kbd>←</Kbd>
              <Kbd>→</Kbd>
              move
            </span>
            <span className="flex items-center gap-1">
              <Kbd>↵</Kbd> pick
            </span>
            <span className="flex items-center gap-1">
              <Kbd>esc</Kbd> close
            </span>
          </div>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
