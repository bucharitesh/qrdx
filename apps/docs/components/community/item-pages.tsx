// Long community lists (the official frame library alone is hundreds of
// frames) are shown a page at a time, so a page never draws every design.
// A server component: the links keep the page's other parameters.

import { cn } from "@repo/design-system/lib/utils";
import { ArrowLeft2, ArrowRight2 } from "iconsax-reactjs";
import Link from "next/link";
import { useTranslations } from "next-intl";

/** Items per page of a community list. */
export const ITEMS_PER_PAGE = 48;

/** The page number in a `page` search parameter (1 when absent or invalid). */
export function pageParam(value: string | string[] | undefined): number {
  const page = typeof value === "string" ? Number.parseInt(value, 10) : 1;
  return Number.isFinite(page) && page > 0 ? page : 1;
}

/** One page of `items`, with the page clamped to the ones that exist. */
export function pageOf<T>(items: readonly T[], requested: number) {
  const pages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
  const page = Math.min(requested, pages);
  return {
    page,
    pages,
    items: items.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE),
  };
}

/** Previous and next links, with "Page 2 of 9" between them. */
export function ItemPages({
  page,
  pages,
  href,
}: {
  page: number;
  pages: number;
  /** The link to a page */
  href: (page: number) => string;
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
      {page < pages ? (
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
