import { Button } from "@repo/design-system/components/ui/button";
import Link from "next/link";
import { PAGE_SIZE } from "../_lib/queries";

/** Prev/next links that keep the other search params. */
export function Pager({
  basePath,
  page,
  total,
  params = {},
}: {
  basePath: string;
  page: number;
  total: number;
  params?: Record<string, string | undefined>;
}) {
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const hrefFor = (target: number) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) search.set(key, value);
    }
    if (target > 1) search.set("page", String(target));
    const query = search.toString();
    return query ? `${basePath}?${query}` : basePath;
  };

  return (
    <div className="flex items-center justify-between gap-2 pt-4 text-sm">
      <span className="text-muted-foreground">
        Page {Math.min(page, pageCount)} of {pageCount} · {total} total
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Button asChild size="sm" variant="outline">
            <Link href={hrefFor(page - 1)}>Previous</Link>
          </Button>
        ) : (
          <Button disabled size="sm" variant="outline">
            Previous
          </Button>
        )}
        {page < pageCount ? (
          <Button asChild size="sm" variant="outline">
            <Link href={hrefFor(page + 1)}>Next</Link>
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
