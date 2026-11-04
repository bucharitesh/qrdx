"use client";

// The pages list's toolbar: the same Filter, Display and live search as the
// codes list, so both areas work the same way. Filters live in the URL.

import { Close as X } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import { Filter } from "iconsax-reactjs";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  DisplayMenu,
  ListSearch,
} from "@/app/dashboard/codes/_components/display-menu";

export interface PagesFilters {
  q: string;
  /** A page type (lib/landing/templates); null for every type */
  type: string | null;
}

export function pagesHref(
  basePath: string,
  filters: PagesFilters,
  patch: Partial<PagesFilters>,
): string {
  const next = { ...filters, ...patch };
  const search = new URLSearchParams();
  if (next.type) search.set("type", next.type);
  if (next.q) search.set("q", next.q);
  const query = search.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function PagesToolbar({
  filters,
  types,
}: {
  filters: PagesFilters;
  /** The types the workspace's pages use, with their labels */
  types: { type: string; label: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const go = (patch: Partial<PagesFilters>, replace = false) =>
    startTransition(() => {
      const href = pagesHref(pathname, filters, patch);
      if (replace) router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    });
  const typeLabel = types.find((item) => item.type === filters.type)?.label;

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Filter aria-hidden />
                Filter
                {filters.type && (
                  <span className="bg-foreground text-background rounded-full px-1.5 text-[11px] leading-4 font-medium">
                    1
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuRadioGroup
                onValueChange={(value) =>
                  go({ type: value === "any" ? null : value })
                }
                value={filters.type ?? "any"}
              >
                <DropdownMenuRadioItem value="any">
                  Every type
                </DropdownMenuRadioItem>
                {types.map((item) => (
                  <DropdownMenuRadioItem key={item.type} value={item.type}>
                    {item.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <DisplayMenu properties={[]} />
        </div>
        <ListSearch
          className="flex-1 sm:ml-auto sm:max-w-sm"
          label="Search pages"
          onSearch={(q) => go({ q }, true)}
          placeholder="Search pages"
          value={filters.q}
        />
      </div>
      {filters.type && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            className="h-7 rounded-full"
            onClick={() => go({ type: null })}
            size="sm"
            variant="secondary"
          >
            {typeLabel ?? filters.type}
            <X aria-hidden />
            <span className="sr-only">Remove filter</span>
          </Button>
        </div>
      )}
    </div>
  );
}
