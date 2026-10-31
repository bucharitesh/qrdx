"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Card } from "@repo/design-system/components/ui/card";
import { Input } from "@repo/design-system/components/ui/input";
import { cn } from "@repo/design-system/lib/utils";
import {
  CATALOG_CATEGORIES,
  type CatalogCategory,
  getIntegrationCatalog,
  matchesCatalogQuery,
} from "@repo/integrations/src/catalog";
import { SearchNormal1 } from "iconsax-reactjs";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { useMemo } from "react";
import { HairlineFigure } from "@/components/mockups/hairline";
import { LAYOUT_TRANSITION } from "@/components/mockups/motion";
import { IntegrationCard } from "@/components/sections/integrations/integration-card";

type Filter = "all" | CatalogCategory;

const FILTERS = [
  "all",
  ...CATALOG_CATEGORIES.map((category) => category.id),
] as const satisfies readonly Filter[];

const ENTRIES = getIntegrationCatalog();

const COUNTS = Object.fromEntries(
  FILTERS.map((filter) => [
    filter,
    filter === "all"
      ? ENTRIES.length
      : ENTRIES.filter((entry) => entry.categories.includes(filter)).length,
  ]),
) as Record<Filter, number>;

const labelOf = (filter: Filter) =>
  filter === "all"
    ? "All"
    : (CATALOG_CATEGORIES.find((category) => category.id === filter)?.label ??
      "");

/**
 * Spans that keep the last row full: 2 columns from sm, 3 (on a 6-track
 * grid) from xl. A lone last card spans the row; two share it.
 */
function spanFor(index: number, total: number): string {
  const classes = ["xl:col-span-2"];
  if (total % 2 === 1 && index === total - 1) classes.push("sm:col-span-2");
  const rest = total % 3;
  if (rest === 1 && index === total - 1) classes.push("xl:col-span-6");
  if (rest === 2 && index >= total - 2) classes.push("xl:col-span-3");
  return classes.join(" ");
}

function FilterButton({
  filter,
  active,
  onSelect,
  layoutId,
  className,
}: {
  filter: Filter;
  active: boolean;
  onSelect: (filter: Filter) => void;
  layoutId: string;
  className?: string;
}) {
  const reduce = useReducedMotion();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-pressed={active}
      onClick={() => onSelect(filter)}
      className={cn(
        "relative shrink-0 justify-between gap-3 text-muted-foreground hover:text-foreground",
        active &&
          "text-foreground hover:bg-transparent dark:hover:bg-transparent",
        className,
      )}
    >
      {active && (
        <motion.span
          layoutId={layoutId}
          aria-hidden
          className="absolute inset-0 rounded-full border bg-card shadow-xs dark:bg-accent dark:shadow-none"
          transition={reduce ? { duration: 0 } : LAYOUT_TRANSITION}
        />
      )}
      <span className="relative">{labelOf(filter)}</span>
      <span className="relative text-xs font-normal tabular-nums text-muted-foreground">
        {COUNTS[filter]}
      </span>
    </Button>
  );
}

/** Category filter (sidebar on desktop, chips on mobile) and search, both in the URL. */
export function IntegrationsDirectory({
  unconfigured = [],
}: {
  /** Slugs of integrations this server can't connect yet. */
  unconfigured?: string[];
}) {
  const [filter, setFilter] = useQueryState(
    "category",
    parseAsStringLiteral(FILTERS).withDefault("all"),
  );
  const [query, setQuery] = useQueryState(
    "q",
    parseAsString.withDefault("").withOptions({ throttleMs: 200 }),
  );

  const results = useMemo(
    () =>
      ENTRIES.filter(
        (entry) =>
          (filter === "all" || entry.categories.includes(filter)) &&
          matchesCatalogQuery(entry, query),
      ),
    [filter, query],
  );

  const select = (next: Filter) => {
    void setFilter(next === "all" ? null : next);
  };
  const category = CATALOG_CATEGORIES.find((item) => item.id === filter);

  return (
    <div className="grid gap-8 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10">
      <nav aria-label="Integration categories" className="hidden lg:block">
        <div className="sticky top-24 flex flex-col gap-0.5">
          <p className="px-3 pb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Categories
          </p>
          {FILTERS.map((item) => (
            <FilterButton
              key={item}
              filter={item}
              active={filter === item}
              onSelect={select}
              layoutId="integrations-filter-side"
              className="w-full"
            />
          ))}
        </div>
      </nav>

      <div className="flex min-w-0 flex-col gap-6">
        <div className="flex flex-col gap-3">
          <div className="relative">
            <SearchNormal1
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              value={query}
              onChange={(event) => {
                void setQuery(event.target.value || null);
              }}
              placeholder="Search Slack, Zapier, Claude, webhooks…"
              aria-label="Search integrations"
              className="h-11 pl-10"
            />
          </div>
          <div
            role="toolbar"
            aria-label="Integration categories"
            className="-mx-6 flex snap-x gap-1 overflow-x-auto px-6 [mask-image:linear-gradient(to_right,transparent,black_24px,black_calc(100%-24px),transparent)] [scrollbar-width:none] md:-mx-10 md:px-10 lg:hidden"
          >
            {FILTERS.map((item) => (
              <FilterButton
                key={item}
                filter={item}
                active={filter === item}
                onSelect={select}
                layoutId="integrations-filter-chips"
                className="snap-start"
              />
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-lg font-semibold tracking-tight">
            {category ? category.label : "All integrations"}
          </h2>
          <p className="text-sm text-muted-foreground text-pretty">
            {category
              ? category.description
              : "Built in, one-click connections and step-by-step guides."}
          </p>
          <p className="sr-only" aria-live="polite">
            {results.length}{" "}
            {results.length === 1 ? "integration" : "integrations"} shown
          </p>
        </div>

        {results.length > 0 ? (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
            {results.map((entry, index) => (
              <li
                key={entry.slug}
                className={cn("min-w-0", spanFor(index, results.length))}
              >
                <IntegrationCard
                  entry={entry}
                  notConfigured={unconfigured.includes(entry.slug)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <Card className="items-center gap-4 px-6 py-10 text-center shadow-xs dark:shadow-none">
            <HairlineFigure
              figure="Loupe"
              surface="card"
              className="aspect-square w-28"
            />
            <div className="flex flex-col gap-1">
              <p className="font-medium">
                Nothing matches &ldquo;{query.trim()}&rdquo;
                {category && ` in ${category.label}`}
              </p>
              <p className="max-w-sm text-sm text-muted-foreground text-pretty">
                Anything that accepts a webhook or calls a REST API can still
                connect to QRdx.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  void setQuery(null);
                  void setFilter(null);
                }}
              >
                Clear search
              </Button>
              <Button variant="ghost" asChild>
                <Link href="/integrations/webhooks">See webhooks</Link>
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
