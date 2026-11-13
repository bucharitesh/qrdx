// Long community lists (the official frame library alone is hundreds of
// frames) are shown a page at a time, so a page never draws every design.
// A server component: the links keep the page's other parameters.

import { cn } from "@repo/design-system/lib/utils";
import { ArrowLeft2, ArrowRight2 } from "iconsax-reactjs";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { pageSlice, parsePage } from "@/lib/paging";

/** Items per page of a community list. */
export const ITEMS_PER_PAGE = 48;

/** The page number in a `page` search parameter (1 when absent or invalid). */
export const pageParam = (value: string | string[] | undefined): number =>
  parsePage(value);

/** One page of `items`, with the page clamped to the ones that exist. */
export function pageOf<T>(items: readonly T[], requested: number) {
  const {
    page,
    pages,
    items: shown,
  } = pageSlice(items, requested, ITEMS_PER_PAGE);
  return { page, pages, items: shown };
}

/**
 * Previous and next links, with "Page 2 of 9" between them. A list that
 * loads its next pages as someone scrolls (components/infinite) has its own
 * link to the next page: it shows this above the list without `next`, on
 * the numbered pages after the first.
 */
export function ItemPages({
  page,
  pages,
  href,
  next = true,
}: {
  page: number;
  pages: number;
  /** The link to a page */
  href: (page: number) => string;
  /** Show the link to the next page */
  next?: boolean;
}) {
  const t = useTranslations("community.itemPages");
  if (pages <= 1) return null;
  const link =
    "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm transition-colors";
  return (
    <nav
      aria-label={t("pages")}
      className="flex items-center justify-center gap-3 pt-2"
    >
      {page > 1 ? (
        <Link
          className={cn(link, "text-muted-foreground hover:text-foreground")}
          href={href(page - 1)}
          rel="prev"
        >
          <ArrowLeft2 aria-hidden className="size-3.5" />
          {t("previous")}
        </Link>
      ) : (
        <span aria-hidden className={cn(link, "invisible")}>
          {t("previous")}
        </span>
      )}
      <span className="text-muted-foreground text-sm tabular-nums">
        {t("pagePageOfPages", { page, pages })}
      </span>
      {!next ? null : page < pages ? (
        <Link
          className={cn(link, "text-muted-foreground hover:text-foreground")}
          href={href(page + 1)}
          rel="next"
        >
          {t("next")}
          <ArrowRight2 aria-hidden className="size-3.5" />
        </Link>
      ) : (
        <span aria-hidden className={cn(link, "invisible")}>
          {t("next")}
        </span>
      )}
    </nav>
  );
}
