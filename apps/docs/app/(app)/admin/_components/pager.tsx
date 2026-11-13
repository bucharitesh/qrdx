import { Button } from "@repo/design-system/components/ui/button";
import Link from "next/link";
import { clampPage, pageCountOf } from "@/lib/paging";

/**
 * Prev/next links that keep the other search params. Nothing when there are
 * no rows. A page past the end counts as the last page, so its links never
 * point further out (the lists load the last page then, see loadPage).
 */
export function Pager({
  basePath,
  page,
  total,
  params = {},
  pageParam = "page",
}: {
  basePath: string;
  page: number;
  total: number;
  params?: Record<string, string | undefined>;
  /** The search param holding the page, for a second paged list on a page. */
  pageParam?: string;
}) {
  if (total <= 0) return null;
  const pageCount = pageCountOf(total);
  const current = clampPage(page, total);

  const hrefFor = (target: number) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value && key !== pageParam) search.set(key, value);
    }
    if (target > 1) search.set(pageParam, String(target));
    const query = search.toString();
    return query ? `${basePath}?${query}` : basePath;
  };

  return (
    <div className="flex items-center justify-between gap-2 pt-4 text-sm">
      <span className="text-muted-foreground">
        Page {current} of {pageCount} · {total} total
      </span>
      <div className="flex gap-2">
        {current > 1 ? (
          <Button asChild size="sm" variant="outline">
            <Link href={hrefFor(current - 1)}>Previous</Link>
          </Button>
        ) : (
          <Button disabled size="sm" variant="outline">
            Previous
          </Button>
        )}
        {current < pageCount ? (
          <Button asChild size="sm" variant="outline">
            <Link href={hrefFor(current + 1)}>Next</Link>
          </Button>
        ) : (
          <Button disabled size="sm" variant="outline">
            Next
          </Button>
        )}
      </div>
    </div>
  );
}
