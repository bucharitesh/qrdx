"use client";
import { useTranslations } from "next-intl";

// The "Brand logos" gallery: every Simple Icons brand as a QR logo. Loaded
// only when someone opens it (next/dynamic in logo-controls.tsx), and it
// loads its data then too: the search index from /api/brand-logos and each
// mark's thumbnail from /api/brand-logos/<slug> as it scrolls into view.
// A picked mark is turned into an SVG data URL here, so the code carries
// the logo itself, as with an upload, and never loads it from anywhere.

import { Tick } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogTitle,
} from "@repo/design-system/components/ui/revola";
import { Switch } from "@repo/design-system/components/ui/switch";
import { cn } from "@repo/design-system/lib/utils";
import { SearchNormal1 } from "iconsax-reactjs";
import * as React from "react";
import { DialogCloseButton } from "@/components/editor/dialog-close-button";
import { POPULAR_BRAND_GROUPS } from "@/lib/brand-logos/popular";
import {
  BRAND_LOGO_COLOR_NAMES,
  BRAND_LOGO_COLORS,
  type BrandIcon,
  type BrandLogoColor,
  brandLogoDataUrl,
  brandNeedsPlate,
  brandPlateColor,
  logoMarkerOf,
  parseBrandLogoRef,
} from "@/lib/brand-logos/svg";
import { soundEvent } from "@/lib/sound/emit";
import { type BrandEntry, rankBrands, toBrandEntry } from "./search";

const PAGE = 96;

interface BrandIndex {
  version: string;
  brands: BrandEntry[];
  bySlug: Map<string, BrandEntry>;
}

let indexRequest: Promise<BrandIndex> | null = null;

/** The search index, fetched once per page load. */
function loadIndex(): Promise<BrandIndex> {
  indexRequest ??= fetch("/api/brand-logos")
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json() as Promise<{
        version: string;
        brands: Parameters<typeof toBrandEntry>[0][];
      }>;
    })
    .then(({ version, brands }) => {
      const entries = brands.map(toBrandEntry);
      return {
        version,
        brands: entries,
        bySlug: new Map(entries.map((entry) => [entry.slug, entry])),
      };
    })
    .catch((error: unknown) => {
      indexRequest = null;
      throw error;
    });
  return indexRequest;
}

const markUrl = (slug: string, version: string) =>
  `/api/brand-logos/${slug}?v=${encodeURIComponent(version)}`;

/** The mark's path, read from QRdx's own SVG for it. */
async function loadMark(
  entry: BrandEntry,
  version: string,
): Promise<BrandIcon> {
  const response = await fetch(markUrl(entry.slug, version));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const path = / d="([^"]+)"/.exec(await response.text())?.[1];
  if (!path) throw new Error("No path in the mark");
  return { slug: entry.slug, title: entry.title, hex: entry.hex, path };
}

export interface BrandLogoPick {
  /** The logo as an SVG data URL, for customLogo */
  logo: string;
  /** A plate color for logoOptions.plate, or undefined for none */
  plate: string | undefined;
}

interface BrandLogoGalleryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The code's logo now (to mark the brand it is) */
  current: string | undefined;
  /** Whether the code has a plate behind its logo now */
  hasPlate: boolean;
  onPick: (pick: BrandLogoPick) => void;
}

export function BrandLogoGallery({
  open,
  onOpenChange,
  current,
  hasPlate,
  onPick,
}: BrandLogoGalleryProps) {
  const t = useTranslations("editor.brandLogos.brandLogoGallery");
  const [index, setIndex] = React.useState<BrandIndex | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [query, setQuery] = React.useState("");
  // Gallery logos are tagged "<slug>:<color>"; quick icons have no color.
  const marker = logoMarkerOf(current);
  const currentBrand = marker?.includes(":") ? parseBrandLogoRef(marker) : null;
  const [color, setColor] = React.useState<BrandLogoColor>(
    currentBrand?.color ?? "brand",
  );
  const [plate, setPlate] = React.useState(hasPlate);
  const [shown, setShown] = React.useState(PAGE);
  const [picking, setPicking] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setFailed(false);
    loadIndex()
      .then(setIndex)
      .catch(() => setFailed(true));
  }, []);

  React.useEffect(() => {
    if (open && !index) load();
  }, [open, index, load]);

  // Each time it opens, start from the code's logo as it is now.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only on open
  React.useEffect(() => {
    if (!open) return;
    setPlate(hasPlate);
    if (currentBrand) setColor(currentBrand.color);
  }, [open]);

  // A fresh page of results for every search.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on query
  React.useEffect(() => setShown(PAGE), [query]);

  const results = React.useMemo(
    () => (index && query.trim() ? rankBrands(index.brands, query) : null),
    [index, query],
  );

  const groups = React.useMemo(
    () =>
      index
        ? POPULAR_BRAND_GROUPS.map((group) => ({
            ...group,
            brands: group.slugs
              .map((slug) => index.bySlug.get(slug))
              .filter((entry): entry is BrandEntry => Boolean(entry)),
          }))
        : [],
    [index],
  );

  const pick = async (entry: BrandEntry) => {
    if (!index || picking) return;
    setPicking(entry.slug);
    try {
      const icon = await loadMark(entry, index.version);
      const needsPlate = brandNeedsPlate(entry.hex, color);
      onPick({
        logo: brandLogoDataUrl(icon, color),
        plate:
          plate || needsPlate ? brandPlateColor(entry.hex, color) : undefined,
      });
      soundEvent("tick");
      onOpenChange(false);
    } catch {
      soundEvent("error");
      setFailed(true);
    } finally {
      setPicking(null);
    }
  };

  const tile = (entry: BrandEntry) => (
    <BrandTile
      busy={picking === entry.slug}
      color={color}
      entry={entry}
      key={entry.slug}
      onPick={() => pick(entry)}
      plate={plate}
      selected={currentBrand?.slug === entry.slug}
      version={index?.version ?? ""}
    />
  );

  return (
    <ResponsiveDialog onOpenChange={onOpenChange} open={open}>
      <ResponsiveDialogContent className="max-h-[92dvh] gap-0 overflow-hidden p-0 sm:max-w-3xl dark:!border-border">
        <div className="flex h-[82dvh] flex-col sm:h-[min(640px,85dvh)]">
          <div className="flex items-start gap-3 px-4 pt-1 pb-3 sm:px-5 sm:pt-4">
            <div className="min-w-0 flex-1">
              <ResponsiveDialogTitle className="text-base">
                {t("brandLogos")}
              </ResponsiveDialogTitle>
              <ResponsiveDialogDescription className="mt-1 text-xs">
                {index
                  ? t("valueBrandsFromSimpleIcons", {
                      value: index.brands.length.toLocaleString("en-US"),
                    })
                  : t("brandsFromSimpleIconsEach")}
              </ResponsiveDialogDescription>
            </div>
            <DialogCloseButton className="-mt-1 -mr-1 hidden sm:inline-flex" />
          </div>

          <div className="space-y-3 border-b px-4 pb-3 sm:px-5">
            <div className="relative">
              <SearchNormal1 className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                aria-label={t("searchBrands")}
                className="h-10 pl-9"
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("searchSpotifyPaypalGoogleMaps")}
                type="search"
                value={query}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <fieldset
                aria-label={t("logoColor")}
                className="flex flex-wrap gap-1.5"
              >
                {BRAND_LOGO_COLORS.map((id) => (
                  <Button
                    aria-pressed={color === id}
                    key={id}
                    onClick={() => setColor(id)}
                    size="sm"
                    type="button"
                    variant={color === id ? "secondary" : "outline"}
                  >
                    {BRAND_LOGO_COLOR_NAMES[id]}
                  </Button>
                ))}
              </fieldset>
              <div className="flex items-center gap-2">
                <Label
                  className="text-muted-foreground cursor-pointer text-sm font-normal"
                  htmlFor="brand-logo-plate"
                >
                  {color === "white" ? t("plateNeededForWhite") : t("plate")}
                </Label>
                <Switch
                  checked={plate || color === "white"}
                  disabled={color === "white"}
                  id="brand-logo-plate"
                  onCheckedChange={setPlate}
                />
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
            {failed ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <p className="text-muted-foreground text-sm">
                  {t("theBrandLogosDidntLoad")}
                </p>
                <Button
                  onClick={load}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {t("tryAgain")}
                </Button>
              </div>
            ) : !index ? (
              <BrandGrid>
                {Array.from({ length: 18 }, (_, i) => (
                  <span
                    className="bg-muted/60 aspect-square animate-pulse rounded-lg"
                    key={i}
                  />
                ))}
              </BrandGrid>
            ) : results ? (
              results.length === 0 ? (
                <p className="text-muted-foreground py-16 text-center text-sm text-pretty">
                  {t("noBrandMatchesQuerySome", { query: query.trim() })}
                </p>
              ) : (
                <section aria-label={t("results")} className="space-y-3">
                  <h3 className="text-muted-foreground text-xs font-medium">
                    {results.length === 1
                      ? t("n1Brand")
                      : t("valueBrands", {
                          value: results.length.toLocaleString("en-US"),
                        })}
                  </h3>
                  <BrandGrid>{results.slice(0, shown).map(tile)}</BrandGrid>
                  {results.length > shown && (
                    <ShowMore onClick={() => setShown((n) => n + PAGE)} />
                  )}
                </section>
              )
            ) : (
              <div className="space-y-6">
                {groups.map((group) => (
                  <section
                    aria-labelledby={`brand-group-${group.id}`}
                    className="space-y-3"
                    key={group.id}
                  >
                    <h3
                      className="text-muted-foreground text-xs font-medium"
                      id={`brand-group-${group.id}`}
                    >
                      {group.label}
                    </h3>
                    <BrandGrid>{group.brands.map(tile)}</BrandGrid>
                  </section>
                ))}
                <section
                  aria-labelledby="brand-group-all"
                  className="space-y-3"
                >
                  <h3
                    className="text-muted-foreground text-xs font-medium"
                    id="brand-group-all"
                  >
                    {t("allBrandsAToZ")}
                  </h3>
                  <BrandGrid>
                    {index.brands.slice(0, shown).map(tile)}
                  </BrandGrid>
                  {index.brands.length > shown && (
                    <ShowMore onClick={() => setShown((n) => n + PAGE)} />
                  )}
                </section>
              </div>
            )}
          </div>

          <p className="text-muted-foreground border-t px-4 py-2.5 text-[11px] text-pretty sm:px-5">
            {t("logosFromSimpleIconsCc0")}
          </p>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

function BrandGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
      {children}
    </div>
  );
}

function ShowMore({ onClick }: { onClick: () => void }) {
  const t = useTranslations("editor.brandLogos.brandLogoGallery");
  return (
    <div className="flex justify-center pt-1">
      <Button onClick={onClick} size="sm" type="button" variant="outline">
        {t("showMore")}
      </Button>
    </div>
  );
}

/** One brand: its mark as it would sit in the code, and its name. */
function BrandTile({
  entry,
  version,
  color,
  plate,
  selected,
  busy,
  onPick,
}: {
  entry: BrandEntry;
  version: string;
  color: BrandLogoColor;
  plate: boolean;
  selected: boolean;
  busy: boolean;
  onPick: () => void;
}) {
  const t = useTranslations("editor.brandLogos.brandLogoGallery");
  const withPlate = plate || brandNeedsPlate(entry.hex, color);
  const background = withPlate ? brandPlateColor(entry.hex, color) : "#ffffff";
  return (
    <button
      aria-busy={busy}
      aria-label={t("titleLogo", { title: entry.title })}
      aria-pressed={selected}
      className={cn(
        "group bg-card relative flex min-w-0 flex-col items-center gap-1.5 rounded-lg border p-1.5 pb-1 transition-[background-color,border-color,transform] outline-none active:scale-[0.97] hover:border-foreground/20 hover:bg-accent/40 focus-visible:border-foreground/30 focus-visible:ring-ring/40 focus-visible:ring-[3px]",
        selected &&
          "border-foreground/40 bg-accent/60 hover:border-foreground/40",
      )}
      onClick={onPick}
      title={entry.title}
      type="button"
    >
      <span
        className={cn(
          "grid aspect-square w-full place-items-center ring-1 ring-black/5",
          withPlate ? "rounded-[22%]" : "rounded-[9px]",
          busy && "animate-pulse",
        )}
        style={{ background }}
      >
        <img
          alt=""
          className={cn(
            "size-[52%] object-contain",
            color === "black" && "brightness-0",
            color === "white" && "brightness-0 invert",
          )}
          decoding="async"
          height={24}
          loading="lazy"
          src={markUrl(entry.slug, version)}
          width={24}
        />
      </span>
      <span className="text-muted-foreground group-hover:text-foreground w-full truncate text-center text-[11px] leading-tight">
        {entry.title}
      </span>
      {selected && (
        <span className="bg-primary text-primary-foreground absolute -top-1 -right-1 grid size-4 place-items-center rounded-full shadow-sm">
          <Tick className="size-3" />
        </span>
      )}
    </button>
  );
}
