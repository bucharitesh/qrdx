"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Card } from "@repo/design-system/components/ui/card";
import { Input } from "@repo/design-system/components/ui/input";
import { cn } from "@repo/design-system/lib/utils";
import {
  type CatalogCategory,
  getCatalogEntry,
  getIntegrationCatalog,
  getUsedCategories,
  type IntegrationCatalogEntry,
  isListedIntegration,
  matchesCatalogQuery,
} from "@repo/integrations/src/catalog";
import { ArrowRight, SearchNormal1 } from "iconsax-reactjs";
import Link from "next/link";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { useMemo } from "react";
import { HairlineFigure } from "@/components/mockups/hairline";
import { useSlidingPill } from "@/components/mockups/sliding-pill";
import { IntegrationCard } from "@/components/sections/integrations/integration-card";
import { IntegrationLogo } from "@/components/sections/integrations/integration-logo";

type Filter = "all" | CatalogCategory;

/** AI assistants, plugins, developer tools and features: on other pages. */
const ELSEWHERE = getIntegrationCatalog().filter(
  (entry) => !isListedIntegration(entry) && entry.canonicalPath,
);

/** Where the sidebar sends people looking for what isn't listed here. */
const MORE_LINKS = [
  { label: "AI assistants", href: "/mcp" },
  { label: "Plugins", href: "/plugins" },
  { label: "Build with QRdx", href: "#build" },
];

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
  label,
  count,
  active,
  onSelect,
  pill,
  className,
}: {
  label: string;
  count: number;
  active: boolean;
  onSelect: () => void;
  /** The group's sliding highlight (useSlidingPill), shown on the active filter. */
  pill: (node: HTMLSpanElement | null) => void;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-pressed={active}
      onClick={onSelect}
      className={cn(
        "relative shrink-0 justify-between gap-3 text-muted-foreground hover:text-foreground",
        active &&
          "text-foreground hover:bg-transparent dark:hover:bg-transparent",
        className,
      )}
    >
      {active && (
        <span
          ref={pill}
          aria-hidden
          className="absolute inset-0 rounded-full border bg-card shadow-xs dark:bg-accent dark:shadow-none"
        />
      )}
      <span className="relative">{label}</span>
      <span className="relative text-xs font-normal tabular-nums text-muted-foreground">
        {count}
      </span>
    </Button>
  );
}

/** Links to the pages that cover what a search found outside this list. */
function ElsewhereList({ entries }: { entries: IntegrationCatalogEntry[] }) {
  return (
    <ul className="flex w-full max-w-md flex-col divide-y rounded-xl border text-left">
      {entries.map((entry) => (
        <li key={entry.slug}>
          <Link
            href={entry.canonicalPath ?? "/integrations"}
            className="group flex items-center gap-3 px-3.5 py-2.5 transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-accent/40"
          >
            <IntegrationLogo logo={entry.logo} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {entry.name}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {entry.canonicalPath?.startsWith("/mcp")
                  ? "On the MCP server page"
                  : entry.canonicalPath?.startsWith("/plugins")
                    ? "On the plugins page"
                    : "In the docs"}
              </span>
            </span>
            <ArrowRight
              aria-hidden
              className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-foreground"
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * Category filter (sidebar on desktop, chips on mobile) and search, both in
 * the URL. Lists the third-party integrations this server can offer.
 */
export function IntegrationsDirectory({
  slugs,
  needsSetup = {},
}: {
  /** Listed integrations to show, in display order (decided on the server). */
  slugs: string[];
  /** Local dev only: slug → env variable names it still needs. */
  needsSetup?: Record<string, string[]>;
}) {
  const entries = useMemo(
    () =>
      slugs
        .map((slug) => getCatalogEntry(slug))
        .filter((entry): entry is IntegrationCatalogEntry => Boolean(entry)),
    [slugs],
  );
  const categories = useMemo(() => getUsedCategories(entries), [entries]);
  const filters = useMemo(
    () => ["all", ...categories.map((category) => category.id)] as Filter[],
    [categories],
  );
  const counts = useMemo(
    () =>
      Object.fromEntries(
        filters.map((filter) => [
          filter,
          filter === "all"
            ? entries.length
            : entries.filter((entry) => entry.categories.includes(filter))
                .length,
        ]),
      ) as Record<Filter, number>,
    [filters, entries],
  );

  const [filter, setFilter] = useQueryState(
    "category",
    parseAsStringLiteral(filters).withDefault("all"),
  );
  const [query, setQuery] = useQueryState(
    "q",
    parseAsString.withDefault("").withOptions({ throttleMs: 200 }),
  );

  const results = useMemo(
    () =>
      entries.filter(
        (entry) =>
          (filter === "all" || entry.categories.includes(filter)) &&
          matchesCatalogQuery(entry, query),
      ),
    [entries, filter, query],
  );
  const elsewhere = useMemo(
    () =>
      query.trim()
        ? ELSEWHERE.filter((entry) => matchesCatalogQuery(entry, query)).slice(
            0,
            4,
          )
        : [],
    [query],
  );

  const sidePill = useSlidingPill();
  const chipsPill = useSlidingPill();
  const select = (next: Filter) => {
    if (next !== filter) {
      sidePill.capture();
      chipsPill.capture();
    }
    void setFilter(next === "all" ? null : next);
  };
  const category = categories.find((item) => item.id === filter);
  const labelOf = (item: Filter) =>
    item === "all"
      ? "All"
      : (categories.find((entry) => entry.id === item)?.label ?? "");

  return (
    <div className="grid gap-8 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10">
      <nav aria-label="Integration categories" className="hidden lg:block">
        <div className="sticky top-24 flex flex-col gap-0.5">
          <p className="px-3 pb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Categories
          </p>
          {filters.map((item) => (
            <FilterButton
              key={item}
              label={labelOf(item)}
              count={counts[item]}
              active={filter === item}
              onSelect={() => select(item)}
              pill={sidePill.pill}
              className="w-full"
            />
          ))}
          <p className="mt-6 border-t px-3 pt-5 pb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Also on QRdx
          </p>
          {MORE_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="group flex h-8 items-center justify-between rounded-full px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground dark:hover:bg-accent/50"
            >
              {link.label}
              <ArrowRight
                aria-hidden
                className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
              />
            </Link>
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
              placeholder="Search Zapier, Discord, Stripe, pixels…"
              aria-label="Search integrations"
              className="h-11 pl-10"
            />
          </div>
          <div
            role="toolbar"
            aria-label="Integration categories"
            className="-mx-6 flex snap-x gap-1 overflow-x-auto px-6 [mask-image:linear-gradient(to_right,transparent,black_24px,black_calc(100%-24px),transparent)] [scrollbar-width:none] md:-mx-10 md:px-10 lg:hidden"
          >
            {filters.map((item) => (
              <FilterButton
                key={item}
                label={labelOf(item)}
                count={counts[item]}
                active={filter === item}
                onSelect={() => select(item)}
                pill={chipsPill.pill}
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
                  needsSetup={needsSetup[entry.slug]}
                />
              </li>
            ))}
          </ul>
        ) : (
          <Card className="items-center gap-4 px-6 py-10 text-center shadow-xs dark:shadow-none">
            {elsewhere.length === 0 && (
              <HairlineFigure
                figure="Loupe"
                surface="card"
                className="aspect-square w-28"
              />
            )}
            <div className="flex flex-col gap-1">
              <p className="font-medium">
                {elsewhere.length > 0
                  ? `“${query.trim()}” is on another page`
                  : `Nothing matches “${query.trim()}”${category ? ` in ${category.label}` : ""}`}
              </p>
              <p className="max-w-sm text-sm text-muted-foreground text-pretty">
                {elsewhere.length > 0
                  ? "This list covers third-party tools. AI assistants, plugins and developer tools have their own pages."
                  : "Anything that accepts a webhook or calls a REST API can still connect to QRdx."}
              </p>
            </div>
            {elsewhere.length > 0 && <ElsewhereList entries={elsewhere} />}
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
              {elsewhere.length === 0 && (
                <Button variant="ghost" asChild>
                  <Link href="/docs/webhooks">See webhooks</Link>
                </Button>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
