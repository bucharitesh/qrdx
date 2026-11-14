"use client";

import { ModuleOrbit } from "@repo/design-system/components/loaders";
import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import type { MouseEvent, RefObject } from "react";
import { useInfiniteScroll } from "@/lib/hooks/use-infinite-scroll";

export interface LoadMoreLabels {
  /** "Load more" */
  loadMore: string;
  /** "Loading…"; the Load more label when omitted */
  loading?: string;
  /** "Try again", after a page failed to load; the Load more label when omitted */
  retry?: string;
  /** Shown once everything has loaded; omit to show nothing */
  end?: string;
}

/**
 * The foot of a list that loads more as you scroll: an invisible sentinel
 * that loads the next page as it nears the viewport (or `root`), and a
 * visible Load more button for anyone the observer misses (keyboard users,
 * old browsers, a list too short to scroll). After an error it stops
 * loading on its own and the button says Try again. Labels come from the
 * caller's own messages.
 *
 * With `href` (a public list's next numbered page, `?page=N`) the button is
 * a plain link with rel="next": crawlers and visits without script follow
 * it, and a click loads the page in place instead.
 */
export function LoadMore({
  hasMore,
  loading,
  error,
  onLoadMore,
  labels,
  root,
  rootMargin,
  count,
  href,
  className,
}: {
  hasMore: boolean;
  loading: boolean;
  error?: string | null;
  onLoadMore: () => void;
  labels: LoadMoreLabels;
  /** The scrolling container, for a list inside a dialog or panel */
  root?: RefObject<Element | null>;
  /** How far ahead of the sentinel to start loading */
  rootMargin?: string;
  /** How many items show; a change checks the sentinel again */
  count?: number;
  /** The next page's own URL, for the button's link */
  href?: string;
  className?: string;
}) {
  const sentinel = useInfiniteScroll({
    onLoadMore,
    enabled: hasMore && !loading && !error,
    root,
    rootMargin,
    watch: count,
  });

  const content = (
    <>
      {loading && <ModuleOrbit aria-hidden />}
      {loading
        ? (labels.loading ?? labels.loadMore)
        : error
          ? (labels.retry ?? labels.loadMore)
          : labels.loadMore}
    </>
  );

  if (!hasMore) {
    return labels.end ? (
      <p
        className={cn(
          "py-3 text-center text-muted-foreground text-xs",
          className,
        )}
      >
        {labels.end}
      </p>
    ) : null;
  }
  return (
    <div
      className={cn("flex flex-col items-center gap-2 py-3", className)}
      data-load-more
    >
      <div aria-hidden className="h-px w-full" ref={sentinel} />
      {error && (
        <p className="text-center text-destructive text-xs" role="alert">
          {error}
        </p>
      )}
      {href ? (
        <Button asChild size="sm" variant="outline">
          <a
            aria-busy={loading || undefined}
            aria-disabled={loading || undefined}
            href={href}
            onClick={(event: MouseEvent<HTMLAnchorElement>) => {
              // Modified clicks open the numbered page in a new tab.
              if (
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              ) {
                return;
              }
              event.preventDefault();
              if (!loading) onLoadMore();
            }}
            rel="next"
          >
            {content}
          </a>
        </Button>
      ) : (
        <Button
          aria-busy={loading || undefined}
          disabled={loading}
          onClick={onLoadMore}
          size="sm"
          type="button"
          variant="outline"
        >
          {content}
        </Button>
      )}
    </div>
  );
}
