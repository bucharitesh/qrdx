import { Button } from "@repo/design-system/components/ui/button";
import Link from "next/link";
import type { ReactNode } from "react";
import { type PageSizeOption, PageSizeSelect } from "./page-size-select";

export interface ListPaginationProps {
  /** "Page 2 of 5 · 120 codes", or "Page 2" when the total isn't counted */
  summary: ReactNode;
  /** The previous and next pages' URLs; null at either end */
  previousHref: string | null;
  nextHref: string | null;
  labels: {
    /** The nav's accessible name ("Pagination") */
    navigation: string;
    previous: string;
    next: string;
    /** The page size control's accessible name ("Rows per page") */
    pageSize?: string;
  };
  /** Page sizes to offer; omit for a list with one size */
  sizes?: { value: number; options: PageSizeOption[] };
}

/**
 * Previous / Next under a dashboard table, with where you are and, when the
 * list offers it, rows per page. Every link is a plain URL (`?page=`,
 * `?size=`), so links, Back and Forward show the same rows. Renders nothing
 * when there's one page and no size to pick.
 */
export function ListPagination({
  summary,
  previousHref,
  nextHref,
  labels,
  sizes,
}: ListPaginationProps) {
  if (!(previousHref || nextHref || sizes)) return null;
  return (
    <nav
      aria-label={labels.navigation}
      className="flex flex-wrap items-center justify-between gap-2 text-sm"
    >
      <span className="text-muted-foreground tabular-nums">{summary}</span>
      <div className="flex items-center gap-2">
        {sizes && (
          <PageSizeSelect
            label={labels.pageSize ?? labels.navigation}
            options={sizes.options}
            value={sizes.value}
          />
        )}
        <PagerButton href={previousHref} rel="prev">
          {labels.previous}
        </PagerButton>
        <PagerButton href={nextHref} rel="next">
          {labels.next}
        </PagerButton>
      </div>
    </nav>
  );
}

function PagerButton({
  href,
  rel,
  children,
}: {
  href: string | null;
  rel: "prev" | "next";
  children: ReactNode;
}) {
  if (!href) {
    return (
      <Button disabled size="sm" variant="outline">
        {children}
      </Button>
    );
  }
  return (
    <Button asChild size="sm" variant="outline">
      <Link href={href} rel={rel} scroll={false}>
        {children}
      </Link>
    </Button>
  );
}
