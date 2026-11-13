"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Spinner } from "@repo/design-system/components/ui/spinner";
import { cn } from "@repo/design-system/lib/utils";
import type { RefObject } from "react";
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
 */
export function LoadMore({
  hasMore,
  loading,
  error,
  onLoadMore,
  labels,
  root,
  count,
  className,
}: {
  hasMore: boolean;
  loading: boolean;
  error?: string | null;
  onLoadMore: () => void;
  labels: LoadMoreLabels;
  /** The scrolling container, for a list inside a dialog or panel */
  root?: RefObject<Element | null>;
  /** How many items show; a change checks the sentinel again */
  count?: number;
  className?: string;
}) {
  const sentinel = useInfiniteScroll({
    onLoadMore,
    enabled: hasMore && !loading && !error,
    root,
    watch: count,
  });

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
      <Button
        aria-busy={loading || undefined}
        disabled={loading}
        onClick={onLoadMore}
        size="sm"
        type="button"
        variant="outline"
      >
        {loading && <Spinner aria-hidden />}
        {loading
          ? (labels.loading ?? labels.loadMore)
          : error
            ? (labels.retry ?? labels.loadMore)
            : labels.loadMore}
      </Button>
    </div>
  );
}
